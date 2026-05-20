/**
 * TimeSelect — stable mobile-friendly time picker.
 *
 * Replaces `<input type="time">` which auto-fires onChange with the
 * current time on iOS/Android focus when the value is empty, causing
 * the form to pre-fill unwanted values before the user touches anything.
 *
 * Renders two <select> elements (hour 00–23, minute in configurable
 * steps). Value in/out is a "HH:MM" 24-hour string — same format the
 * DB stores — so no field renames are needed.
 */

interface TimeSelectProps {
  value: string                  // "HH:MM" or ""
  onChange: (value: string) => void
  minuteStep?: number            // default 15
  className?: string
  disabled?: boolean
}

function pad(n: number) {
  return String(n).padStart(2, '0')
}

function parse(value: string): { h: string; m: string } {
  if (!value) return { h: '', m: '' }
  const [h = '', m = ''] = value.split(':')
  return { h, m }
}

export function TimeSelect({
  value,
  onChange,
  minuteStep = 15,
  className = '',
  disabled = false,
}: TimeSelectProps) {
  const { h, m } = parse(value)

  const hours = Array.from({ length: 24 }, (_, i) => pad(i))
  const minutes: string[] = []
  for (let i = 0; i < 60; i += minuteStep) minutes.push(pad(i))

  function handleHour(newH: string) {
    if (!newH) {
      onChange('')
      return
    }
    // If minute not yet chosen, default to :00
    const resolvedM = m || '00'
    onChange(`${newH}:${resolvedM}`)
  }

  function handleMinute(newM: string) {
    if (!newM) {
      onChange('')
      return
    }
    // If hour not yet chosen, default to 08
    const resolvedH = h || '08'
    onChange(`${resolvedH}:${newM}`)
  }

  const selectClass =
    `form-select text-sm ${className}`.trim()

  return (
    <div className="flex gap-1.5">
      <select
        value={h}
        onChange={(e) => handleHour(e.target.value)}
        disabled={disabled}
        aria-label="Hour"
        className={selectClass}
      >
        <option value="">HH</option>
        {hours.map((hr) => (
          <option key={hr} value={hr}>
            {hr}
          </option>
        ))}
      </select>

      <span className="flex items-center text-muted-foreground font-medium select-none">:</span>

      <select
        value={m}
        onChange={(e) => handleMinute(e.target.value)}
        disabled={disabled}
        aria-label="Minute"
        className={selectClass}
      >
        <option value="">MM</option>
        {minutes.map((mn) => (
          <option key={mn} value={mn}>
            {mn}
          </option>
        ))}
      </select>
    </div>
  )
}
