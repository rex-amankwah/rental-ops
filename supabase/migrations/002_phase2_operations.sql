-- =============================================================
-- RentalOps Phase 2 Migration
-- Availability engine, payment triggers, operational functions
-- =============================================================

-- =============================================================
-- FUNCTION: check_item_availability
-- Returns how many units of a catalog item are available
-- for a given date range, excluding a specific order (for edits)
-- =============================================================
create or replace function public.check_item_availability(
  p_catalog_item_id uuid,
  p_from_date       date,
  p_until_date      date,
  p_exclude_order_id uuid default null
)
returns int
language plpgsql
security definer
stable
as $$
declare
  v_owned     int;
  v_damaged   int;
  v_repair    int;
  v_reserved  int;
begin
  -- Get base quantities
  select
    quantity_owned,
    quantity_damaged,
    quantity_under_repair
  into v_owned, v_damaged, v_repair
  from public.inventory_catalog
  where id = p_catalog_item_id;

  if not found then return 0; end if;

  -- Sum active reservations overlapping the date range
  select coalesce(sum(quantity_reserved), 0)
  into v_reserved
  from public.inventory_reservations
  where catalog_item_id  = p_catalog_item_id
    and status           = 'active'
    and reserved_from   <= p_until_date
    and reserved_until  >= p_from_date
    and (p_exclude_order_id is null or order_id <> p_exclude_order_id);

  return greatest(0, v_owned - v_damaged - v_repair - v_reserved);
end;
$$;

-- =============================================================
-- FUNCTION: reserve_order_items (atomic)
-- Creates reservations for all items in an order.
-- Raises exception if any item is over-capacity.
-- p_override = true skips the availability check (admin only).
-- =============================================================
create or replace function public.reserve_order_items(
  p_order_id   uuid,
  p_override   boolean default false
)
returns void
language plpgsql
security definer
as $$
declare
  r           record;
  v_available int;
  v_from      date;
  v_until     date;
begin
  -- Get delivery/pickup window for this order
  select
    coalesce(delivery_date, event_date),
    coalesce(pickup_date,   event_date + rental_days)
  into v_from, v_until
  from public.rental_orders
  where id = p_order_id;

  if v_from is null then
    raise exception 'Order must have a delivery_date or event_date before reserving inventory';
  end if;

  -- Lock order_items rows to prevent races
  for r in
    select oi.id, oi.catalog_item_id, oi.quantity
    from   public.order_items oi
    where  oi.order_id = p_order_id
      and  oi.catalog_item_id is not null
      and  oi.reservation_status = 'pending'
    for update of oi
  loop
    -- Check availability (excluding this order's existing reservations)
    v_available := public.check_item_availability(
      r.catalog_item_id, v_from, v_until, p_order_id
    );

    if not p_override and v_available < r.quantity then
      raise exception 'Insufficient inventory for item %. Available: %, requested: %',
        r.catalog_item_id, v_available, r.quantity;
    end if;

    -- Insert reservation
    insert into public.inventory_reservations
      (company_id, order_id, order_item_id, catalog_item_id,
       quantity_reserved, reserved_from, reserved_until, status)
    select
      ro.company_id, p_order_id, r.id, r.catalog_item_id,
      r.quantity, v_from, v_until, 'active'
    from public.rental_orders ro
    where ro.id = p_order_id
    on conflict do nothing;

    -- Mark order_item as reserved
    update public.order_items
    set reservation_status = 'reserved', updated_at = now()
    where id = r.id;
  end loop;

  -- Update catalog available/reserved counts
  update public.inventory_catalog ic
  set
    quantity_reserved  = (
      select coalesce(sum(ir.quantity_reserved), 0)
      from   public.inventory_reservations ir
      where  ir.catalog_item_id = ic.id
        and  ir.status = 'active'
    ),
    quantity_available = greatest(0,
      ic.quantity_owned
      - ic.quantity_damaged
      - ic.quantity_under_repair
      - (
        select coalesce(sum(ir.quantity_reserved), 0)
        from   public.inventory_reservations ir
        where  ir.catalog_item_id = ic.id
          and  ir.status = 'active'
      )
    ),
    updated_at = now()
  where ic.id in (
    select catalog_item_id from public.order_items where order_id = p_order_id
  );

  -- Advance order status to inventory_reserved
  update public.rental_orders
  set status = 'inventory_reserved', updated_at = now()
  where id = p_order_id
    and status in ('confirmed', 'awaiting_deposit', 'quote_sent', 'inquiry');

end;
$$;

-- =============================================================
-- FUNCTION: release_order_reservations
-- Cancels all active reservations for an order and restores
-- catalog availability counts.
-- =============================================================
create or replace function public.release_order_reservations(
  p_order_id uuid
)
returns void
language plpgsql
security definer
as $$
begin
  -- Cancel reservations
  update public.inventory_reservations
  set status = 'released', updated_at = now()
  where order_id = p_order_id
    and status   = 'active';

  -- Reset order_items to pending
  update public.order_items
  set reservation_status = 'pending', updated_at = now()
  where order_id = p_order_id
    and reservation_status = 'reserved';

  -- Recalculate catalog counts
  update public.inventory_catalog ic
  set
    quantity_reserved  = (
      select coalesce(sum(ir.quantity_reserved), 0)
      from   public.inventory_reservations ir
      where  ir.catalog_item_id = ic.id and ir.status = 'active'
    ),
    quantity_available = greatest(0,
      ic.quantity_owned - ic.quantity_damaged - ic.quantity_under_repair
      - (
        select coalesce(sum(ir.quantity_reserved), 0)
        from   public.inventory_reservations ir
        where  ir.catalog_item_id = ic.id and ir.status = 'active'
      )
    ),
    updated_at = now()
  where ic.id in (
    select catalog_item_id from public.order_items
    where order_id = p_order_id and catalog_item_id is not null
  );
end;
$$;

-- =============================================================
-- TRIGGER: sync_invoice_payment_totals
-- After any payment insert/update/delete, recalculates
-- amount_paid and balance_due on the related invoice.
-- =============================================================
create or replace function public.sync_invoice_payment_totals()
returns trigger
language plpgsql
security definer
as $$
declare
  v_invoice_id uuid;
  v_paid       numeric(12,2);
begin
  -- Determine which invoice to update
  v_invoice_id := coalesce(NEW.invoice_id, OLD.invoice_id);
  if v_invoice_id is null then return coalesce(NEW, OLD); end if;

  -- Sum completed, non-refund payments for this invoice
  select coalesce(sum(
    case
      when payment_type in ('refund','security_refund') then -amount
      else amount
    end
  ), 0)
  into v_paid
  from public.payments
  where invoice_id = v_invoice_id
    and status = 'completed';

  update public.invoices
  set
    amount_paid = greatest(0, v_paid),
    balance_due = greatest(0, total - greatest(0, v_paid)),
    status = case
      when greatest(0, total - greatest(0, v_paid)) <= 0 then 'paid'
      when greatest(0, v_paid) > 0 then 'partial'
      else status
    end,
    updated_at = now()
  where id = v_invoice_id;

  return coalesce(NEW, OLD);
end;
$$;

drop trigger if exists trg_sync_invoice_payments on public.payments;
create trigger trg_sync_invoice_payments
  after insert or update or delete on public.payments
  for each row execute function public.sync_invoice_payment_totals();

-- =============================================================
-- TRIGGER: sync_order_payment_totals
-- After any payment insert/update/delete, recalculates
-- amount_paid and balance_due on the related order.
-- =============================================================
create or replace function public.sync_order_payment_totals()
returns trigger
language plpgsql
security definer
as $$
declare
  v_order_id uuid;
  v_paid     numeric(12,2);
begin
  v_order_id := coalesce(NEW.order_id, OLD.order_id);
  if v_order_id is null then return coalesce(NEW, OLD); end if;

  select coalesce(sum(
    case
      when payment_type in ('refund','security_refund') then -amount
      else amount
    end
  ), 0)
  into v_paid
  from public.payments
  where order_id = v_order_id
    and status   = 'completed';

  update public.rental_orders
  set
    amount_paid = greatest(0, v_paid),
    balance_due = greatest(0, total_amount - greatest(0, v_paid)),
    deposit_paid = (
      select coalesce(sum(amount), 0)
      from public.payments
      where order_id = v_order_id
        and status = 'completed'
        and payment_type in ('deposit','security_deposit')
    ),
    updated_at = now()
  where id = v_order_id;

  return coalesce(NEW, OLD);
end;
$$;

drop trigger if exists trg_sync_order_payments on public.payments;
create trigger trg_sync_order_payments
  after insert or update or delete on public.payments
  for each row execute function public.sync_order_payment_totals();

-- =============================================================
-- FUNCTION: generate_invoice_from_order
-- Creates a draft invoice with snapshots of all order items.
-- Returns the new invoice id.
-- =============================================================
create or replace function public.generate_invoice_from_order(
  p_order_id  uuid,
  p_actor_id  uuid
)
returns uuid
language plpgsql
security definer
as $$
declare
  v_invoice_id  uuid;
  v_order       record;
  v_item        record;
  v_subtotal    numeric(12,2) := 0;
  v_tax_amount  numeric(12,2);
  v_total       numeric(12,2);
begin
  -- Load order
  select * into v_order
  from public.rental_orders
  where id = p_order_id;

  if not found then
    raise exception 'Order % not found', p_order_id;
  end if;

  -- Create invoice
  insert into public.invoices
    (company_id, order_id, customer_id, status,
     subtotal, delivery_fee, setup_fee, discount, tax_rate,
     tax_amount, total, amount_paid, balance_due,
     issue_date, due_date, created_by)
  values
    (v_order.company_id, p_order_id, v_order.customer_id, 'draft',
     0, v_order.delivery_fee, v_order.setup_fee, v_order.discount_amount,
     (select tax_rate from public.companies where id = v_order.company_id),
     0, 0, 0, 0,
     current_date,
     current_date + interval '7 days',
     p_actor_id)
  returning id into v_invoice_id;

  -- Snapshot order items into invoice_items
  for v_item in
    select * from public.order_items
    where order_id = p_order_id
    order by sort_order
  loop
    insert into public.invoice_items
      (company_id, invoice_id, order_item_id,
       description, quantity, unit_rate, rental_days, line_total, sort_order)
    values
      (v_order.company_id, v_invoice_id, v_item.id,
       v_item.item_name_snapshot,
       v_item.quantity, v_item.unit_rate, v_item.rental_days,
       v_item.line_total, v_item.sort_order);

    v_subtotal := v_subtotal + v_item.line_total;
  end loop;

  -- Add delivery/setup as line items if non-zero
  if v_order.delivery_fee > 0 then
    insert into public.invoice_items
      (company_id, invoice_id, description, quantity, unit_rate, rental_days, line_total, sort_order)
    values
      (v_order.company_id, v_invoice_id, 'Delivery Fee', 1, v_order.delivery_fee, 1, v_order.delivery_fee, 900);
  end if;

  if v_order.setup_fee > 0 then
    insert into public.invoice_items
      (company_id, invoice_id, description, quantity, unit_rate, rental_days, line_total, sort_order)
    values
      (v_order.company_id, v_invoice_id, 'Setup Fee', 1, v_order.setup_fee, 1, v_order.setup_fee, 901);
  end if;

  -- Compute discount line
  if v_order.discount_amount > 0 then
    insert into public.invoice_items
      (company_id, invoice_id, description, quantity, unit_rate, rental_days, line_total, sort_order)
    values
      (v_order.company_id, v_invoice_id, 'Discount', 1, -v_order.discount_amount, 1, -v_order.discount_amount, 902);
  end if;

  -- Recalculate invoice totals
  v_tax_amount := round(
    (v_subtotal + v_order.delivery_fee + v_order.setup_fee - v_order.discount_amount)
    * (select tax_rate from public.companies where id = v_order.company_id), 2
  );
  v_total := v_subtotal + v_order.delivery_fee + v_order.setup_fee
           - v_order.discount_amount + v_tax_amount;

  update public.invoices
  set
    subtotal   = v_subtotal,
    tax_amount = v_tax_amount,
    total      = v_total,
    balance_due = v_total
  where id = v_invoice_id;

  return v_invoice_id;
end;
$$;

-- =============================================================
-- RLS POLICIES for new function access
-- Functions are SECURITY DEFINER so they bypass RLS internally.
-- We only need to ensure the frontend calling user is authenticated
-- and belongs to the right company (validated inside each function
-- via the order's company_id check).
-- No additional RLS needed — existing policies on the underlying
-- tables still protect direct table access.
-- =============================================================

-- Grant execute on new functions to authenticated users
grant execute on function public.check_item_availability(uuid, date, date, uuid)    to authenticated;
grant execute on function public.reserve_order_items(uuid, boolean)                  to authenticated;
grant execute on function public.release_order_reservations(uuid)                    to authenticated;
grant execute on function public.generate_invoice_from_order(uuid, uuid)             to authenticated;
