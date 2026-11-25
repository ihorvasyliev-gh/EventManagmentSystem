import React from 'react';
import {
  Award,
  Baby,
  Bike,
  BookOpen,
  Briefcase,
  Building2,
  Calendar,
  Coffee,
  Compass,
  Film,
  Globe,
  GraduationCap,
  HandHelping,
  Handshake,
  Heart,
  Laptop,
  Leaf,
  Lightbulb,
  Megaphone,
  Mic,
  Music,
  Palette,
  Presentation,
  Sparkles,
  Star,
  Tag,
  Trophy,
  Users,
  Utensils,
  Wrench,
  type LucideIcon
} from 'lucide-react';
import { getCategoryIconId, type CategoryIconId } from '../constants/categories';
import { useCategories } from '../contexts/CategoriesContext';

export interface CategoryIconOption {
  id: CategoryIconId;
  label: string;
  Icon: LucideIcon;
}

export const CATEGORY_ICON_OPTIONS: readonly CategoryIconOption[] = [
  { id: 'briefcase', label: 'Briefcase', Icon: Briefcase },
  { id: 'users', label: 'Community', Icon: Users },
  { id: 'graduation-cap', label: 'Education', Icon: GraduationCap },
  { id: 'sparkles', label: 'Celebration', Icon: Sparkles },
  { id: 'megaphone', label: 'Announcement', Icon: Megaphone },
  { id: 'heart', label: 'Health', Icon: Heart },
  { id: 'presentation', label: 'Seminar', Icon: Presentation },
  { id: 'tag', label: 'Tag', Icon: Tag },
  { id: 'calendar', label: 'Calendar', Icon: Calendar },
  { id: 'book-open', label: 'Book', Icon: BookOpen },
  { id: 'music', label: 'Music', Icon: Music },
  { id: 'palette', label: 'Arts', Icon: Palette },
  { id: 'trophy', label: 'Sports', Icon: Trophy },
  { id: 'leaf', label: 'Nature', Icon: Leaf },
  { id: 'globe', label: 'Global', Icon: Globe },
  { id: 'mic', label: 'Talk', Icon: Mic },
  { id: 'coffee', label: 'Social', Icon: Coffee },
  { id: 'hand-helping', label: 'Support', Icon: HandHelping },
  { id: 'building-2', label: 'Civic', Icon: Building2 },
  { id: 'lightbulb', label: 'Ideas', Icon: Lightbulb },
  { id: 'star', label: 'Featured', Icon: Star },
  { id: 'award', label: 'Award', Icon: Award },
  { id: 'compass', label: 'Explore', Icon: Compass },
  { id: 'wrench', label: 'Workshop', Icon: Wrench },
  { id: 'laptop', label: 'Digital', Icon: Laptop },
  { id: 'bike', label: 'Active', Icon: Bike },
  { id: 'baby', label: 'Family', Icon: Baby },
  { id: 'handshake', label: 'Partnership', Icon: Handshake },
  { id: 'film', label: 'Film', Icon: Film },
  { id: 'utensils', label: 'Food', Icon: Utensils }
];

const ICON_BY_ID: Record<CategoryIconId, LucideIcon> = Object.fromEntries(
  CATEGORY_ICON_OPTIONS.map((o) => [o.id, o.Icon])
) as Record<CategoryIconId, LucideIcon>;

export const getCategoryIconComponent = (iconId: CategoryIconId): LucideIcon =>
  ICON_BY_ID[iconId] ?? Tag;

interface CategoryIconProps {
  /** Category name — resolves its icon from the active categories registry */
  category?: string;
  /** Explicit icon ID (overrides `category`, e.g. in the icon picker preview) */
  iconId?: CategoryIconId;
  className?: string;
}

/** Renders the Lucide icon for a category (subscribes to CategoriesContext so updates re-render) */
const CategoryIcon: React.FC<CategoryIconProps> = ({ category, iconId, className = 'w-3.5 h-3.5 shrink-0' }) => {
  // Subscribe so editing a custom category's icon updates every rendered badge immediately
  useCategories();
  const resolvedId = iconId ?? getCategoryIconId(category);
  const Icon = getCategoryIconComponent(resolvedId);
  return <Icon className={className} aria-hidden="true" />;
};

export default CategoryIcon;
