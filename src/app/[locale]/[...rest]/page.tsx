import { notFound } from "next/navigation";

/** Any unknown path inside a locale renders that locale's not-found page (with header/footer) and a real 404. */
export default function CatchAll() {
  notFound();
}
