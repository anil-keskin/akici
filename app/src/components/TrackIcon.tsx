// Kategori ikonları (emoji yerine tutarlı çizgi ikonlar)
import { Briefcase, Plane, MessagesSquare, GraduationCap, Laptop, Stethoscope, Clapperboard, House, Users, BookOpenText, type LucideIcon } from "lucide-react";

const ICONS: Record<string, LucideIcon> = {
  is: Briefcase, seyahat: Plane, gunluk: MessagesSquare, sinav: GraduationCap, teknoloji: Laptop,
  saglik: Stethoscope, dizi: Clapperboard, yurtdisi: House, sosyal: Users, akademik: BookOpenText,
};

export function TrackIcon({ id, size = 28 }: { id: string; size?: number }) {
  const I = ICONS[id] || BookOpenText;
  return <I size={size} strokeWidth={2.2} aria-hidden="true" />;
}
