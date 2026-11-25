import * as React from "react"
import { CalendarDays } from "lucide-react"

import { cn } from "@/lib/utils"
import { displayToIso, isoToDisplay, maskDateTyping } from "@/lib/dateInput"

const BASE =
  "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm"

// <Input type="date"> prikazuje i prima datum kao dd-mm-yyyy (pregledač bi pokazao mm/dd/yyyy po jeziku sistema).
// Vrednost i onChange ostaju ISO yyyy-mm-dd (e.target.value), kao kod običnog date polja; dugme otvara kalendar.
const DateInput = React.forwardRef(
  ({ className, value, defaultValue, onChange, min, max, disabled, readOnly, name, onBlur, placeholder, ...props }, ref) => {
    const iso = value ?? defaultValue ?? ""
    const [text, setText] = React.useState(() => isoToDisplay(iso))
    const pickerRef = React.useRef(null)

    React.useEffect(() => {
      // Spolja promenjena vrednost (reset forme, izbor iz kalendara) → osveži tekst, osim dok je isti datum u kucanju.
      setText((cur) => (displayToIso(cur) === (iso || null) && cur ? cur : isoToDisplay(iso)))
    }, [iso])

    const emit = (next) => onChange?.({ target: { value: next, name }, currentTarget: { value: next, name } })

    const handleText = (e) => {
      const masked = maskDateTyping(e.target.value)
      setText(masked)
      if (!masked.trim()) {
        if (iso) emit("")
        return
      }
      const parsed = displayToIso(masked)
      if (parsed && parsed !== iso) emit(parsed)
    }

    const handleBlur = (e) => {
      // Nepotpun ili nevažeći unos se ne čuva — vraća se poslednji važeći datum.
      if (text.trim() && !displayToIso(text)) setText(isoToDisplay(iso))
      onBlur?.(e)
    }

    const openPicker = () => {
      const el = pickerRef.current
      if (!el) return
      try {
        el.showPicker()
      } catch {
        el.focus()
        el.click()
      }
    }

    const locked = disabled || readOnly
    return (
      <div className={cn("relative w-full", className?.match(/(^|\s)(w-\S+|min-w-\S+|max-w-\S+|flex-\S+|shrink-\S+)/g)?.join(" "))}>
        <input
          ref={ref}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          placeholder={placeholder ?? "dd-mm-yyyy"}
          value={text}
          onChange={handleText}
          onBlur={handleBlur}
          disabled={disabled}
          readOnly={readOnly}
          name={name}
          className={cn(BASE, "pr-9", className, "w-full")}
          {...props}
        />
        <button
          type="button"
          tabIndex={-1}
          disabled={locked}
          onClick={openPicker}
          aria-label="Calendar"
          className="absolute right-1 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground disabled:opacity-50"
        >
          <CalendarDays className="h-4 w-4" />
        </button>
        <input
          ref={pickerRef}
          type="date"
          tabIndex={-1}
          aria-hidden="true"
          value={iso || ""}
          min={min}
          max={max}
          disabled={locked}
          onChange={(e) => emit(e.target.value)}
          className="pointer-events-none absolute bottom-0 right-0 h-0 w-0 opacity-0"
        />
      </div>
    )
  }
)
DateInput.displayName = "DateInput"

const Input = React.forwardRef(({ className, type, ...props }, ref) => {
  if (type === "date") return <DateInput ref={ref} className={className} {...props} />
  return (
    (<input
      type={type}
      className={cn(BASE, className)}
      ref={ref}
      {...props} />)
  );
})
Input.displayName = "Input"

export { Input }
