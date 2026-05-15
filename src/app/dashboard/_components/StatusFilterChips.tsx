import Link from "next/link";

type StatusFilterChipTone = "neutral" | "green" | "orange" | "red" | "amber" | "emerald" | "sky";

type StatusFilterChipItem = {
  href: string;
  label: string;
  active: boolean;
  tone?: StatusFilterChipTone;
};

function getToneClasses(tone: StatusFilterChipTone, active: boolean) {
  if (tone === "green") {
    return active
      ? "border-green-600 bg-green-600 text-white"
      : "border-green-200 bg-green-50 text-green-800 hover:border-green-300";
  }

  if (tone === "orange") {
    return active
      ? "border-orange-500 bg-orange-500 text-white"
      : "border-orange-200 bg-orange-50 text-orange-800 hover:border-orange-300";
  }

  if (tone === "red") {
    return active
      ? "border-red-600 bg-red-600 text-white"
      : "border-red-200 bg-red-50 text-red-800 hover:border-red-300";
  }

  if (tone === "amber") {
    return active
      ? "border-amber-500 bg-amber-500 text-white"
      : "border-amber-200 bg-amber-50 text-amber-800 hover:border-amber-300";
  }

  if (tone === "emerald") {
    return active
      ? "border-emerald-600 bg-emerald-600 text-white"
      : "border-emerald-200 bg-emerald-50 text-emerald-800 hover:border-emerald-300";
  }

  if (tone === "sky") {
    return active
      ? "border-sky-600 bg-sky-600 text-white"
      : "border-sky-200 bg-sky-50 text-sky-800 hover:border-sky-300";
  }

  return active
    ? "border-slate-900 bg-slate-900 text-white"
    : "border-slate-200 bg-white text-slate-800 hover:border-slate-300";
}

export default function StatusFilterChips(props: {
  ariaLabel: string;
  items: StatusFilterChipItem[];
  className?: string;
}) {
  return (
    <div className={props.className}>
      <div className="overflow-x-auto pb-1 [scrollbar-width:none] [-ms-overflow-style:none]">
        <nav
          aria-label={props.ariaLabel}
          className="flex w-max min-w-full flex-nowrap gap-2 sm:w-auto sm:min-w-0 sm:flex-wrap"
        >
          {props.items.map((item) => (
            <Link
              key={`${item.href}::${item.label}`}
              href={item.href}
              aria-current={item.active ? "page" : undefined}
              className={`inline-flex min-h-10 items-center justify-center rounded-full border px-4 py-2 text-sm font-medium whitespace-nowrap transition ${getToneClasses(item.tone ?? "neutral", item.active)}`}
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </div>
    </div>
  );
}
