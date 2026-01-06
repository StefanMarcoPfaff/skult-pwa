// src/data/courses-demo.ts
export type DemoCourse = {
  id: string;
  title: string;
  subtitle?: string;
  date: string;
  location: string;
  free: number;
  description?: string;
};

export const demoCourses: DemoCourse[] = [
  {
    id: "1",
    title: "Impro Basics",
    subtitle: "Locker werden & spielen",
    date: "Mo, 19:00–21:00",
    location: "Berlin-Mitte",
    free: 3,
    description:
      "Einsteiger*innenkurs mit Warm-ups, Status-Übungen und kurzen Szenen.",
  },
  {
    id: "2",
    title: "Szenenarbeit",
    subtitle: "Texte lebendig machen",
    date: "Mi, 18:30–20:30",
    location: "Online",
    free: 0,
    description:
      "Wir arbeiten mit kleinen Texten/Monologen und fokussieren auf Haltung & Subtext.",
  },
];

export function findCourse(id: string) {
  return demoCourses.find((c) => c.id === id) ?? null;
}
