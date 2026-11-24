// Ikonica „kalendar sa $" za Monthly Payroll (slika5); isti stil kao lucide (24x24, tanak outline).
import React from "react";

export const CalendarDollar = React.forwardRef(function CalendarDollar({ size = 24, strokeWidth = 2, className, ...rest }, ref) {
  return (
    <svg
      ref={ref}
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      {...rest}
    >
      <path d="M8 2v4" />
      <path d="M16 2v4" />
      <rect width="18" height="18" x="3" y="4" rx="2" />
      <path d="M3 10h18" />
      <path d="M12 12.5v6.5" />
      <path d="M14 13.8c-.4-.5-1.1-.8-2-.8-1.1 0-2 .5-2 1.4 0 2 4 1 4 3 0 .9-.9 1.4-2 1.4-.9 0-1.6-.3-2-.8" />
    </svg>
  );
});

/** Naslagani novčići (Project Costs, sekcija Payroll — slika5); isti outline stil kao lucide. */
export const CoinStack = React.forwardRef(function CoinStack({ size = 24, strokeWidth = 2, className, ...rest }, ref) {
  return (
    <svg
      ref={ref}
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      {...rest}
    >
      <ellipse cx="9" cy="5.5" rx="6" ry="2.5" />
      <path d="M3 5.5v3.5c0 1.4 2.7 2.5 6 2.5s6-1.1 6-2.5V5.5" />
      <path d="M3 9v3.5c0 1.4 2.7 2.5 6 2.5 1 0 1.9-.1 2.7-.3" />
      <path d="M3 12.5V16c0 1.4 2.7 2.5 6 2.5 1 0 1.9-.1 2.7-.3" />
      <ellipse cx="15.5" cy="13.5" rx="5.5" ry="2.3" />
      <path d="M10 13.5V17c0 1.3 2.5 2.3 5.5 2.3s5.5-1 5.5-2.3v-3.5" />
      <path d="M10 17v3.2c0 1.3 2.5 2.3 5.5 2.3s5.5-1 5.5-2.3V17" />
    </svg>
  );
});
