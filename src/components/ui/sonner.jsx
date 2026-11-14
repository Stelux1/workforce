import { Toaster as Sonner } from "sonner"

// Aplikacija ima samo svetlu temu (nema ThemeProvider-a), pa je tema fiksna. Ranije je ovde bio `useTheme`
// iz next-themes, koji bez provajdera daje „system" — poruke su bile tamne na svetloj aplikaciji.
const Toaster = ({
  ...props
}) => {
  return (
    (<Sonner
      theme="light"
      className="toaster group"
      toastOptions={{
        classNames: {
          // bez sopstvene pozadine, da bi `richColors` obojio grešku crveno, a uspeh zeleno
          toast: "group toast group-[.toaster]:shadow-lg",
          description: "group-[.toast]:text-muted-foreground",
          actionButton:
            "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
          cancelButton:
            "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
        },
      }}
      {...props} />)
  );
}

export { Toaster }
