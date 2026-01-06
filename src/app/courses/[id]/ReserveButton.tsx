// src/app/courses/[id]/ReserveButton.tsx
"use client";

export default function ReserveButton({ disabled }: { disabled: boolean }) {
  return (
    <button
      disabled={disabled}
      className={`w-full rounded-xl py-2 font-semibold active:scale-[0.99] ${
        disabled ? "bg-gray-200 text-gray-500" : "bg-black text-white"
      }`}
      onClick={() => alert("Demo: Hier kommt später die Buchung rein.")}
    >
      {disabled ? "Ausgebucht" : "Platz reservieren"}
    </button>
  );
}
