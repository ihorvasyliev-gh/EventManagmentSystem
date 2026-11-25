import React from 'react';
import { type CategoryShape, type CategoryTone } from '../constants/categories';
import { TONE_RGB } from '../constants/categoryColors';

export interface CategoryShapeOption {
  id: CategoryShape;
  label: string;
}

export const CATEGORY_SHAPE_OPTIONS: readonly CategoryShapeOption[] = [
  { id: 'circle', label: 'Circle' },
  { id: 'square', label: 'Square' },
  { id: 'triangle', label: 'Triangle' },
  { id: 'diamond', label: 'Diamond' },
  { id: 'triangleDown', label: 'Down triangle' },
  { id: 'hexagon', label: 'Hexagon' },
  { id: 'pentagon', label: 'Pentagon' },
  { id: 'ring', label: 'Ring' },
  { id: 'star', label: 'Star' },
  { id: 'spark', label: '4-point star' },
  { id: 'cross', label: 'Plus' },
  { id: 'xMark', label: 'Cross' },
  { id: 'octagon', label: 'Octagon' },
  { id: 'triangleRight', label: 'Right triangle' },
  { id: 'triangleLeft', label: 'Left triangle' },
  { id: 'shield', label: 'Shield' },
  { id: 'hourglass', label: 'Hourglass' },
  { id: 'squareRing', label: 'Hollow square' },
  { id: 'diamondRing', label: 'Hollow diamond' },
  { id: 'triangleRing', label: 'Hollow triangle' }
];

const polyPoints = (pts: Array<[number, number]>): string =>
  pts.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(' ');

const regularPoly = (sides: number, radius: number, startAngle: number): string =>
  polyPoints(
    Array.from({ length: sides }, (_, k) => {
      const a = startAngle + (k * 2 * Math.PI) / sides;
      return [12 + radius * Math.cos(a), 12 + radius * Math.sin(a)] as [number, number];
    })
  );

const starPoints = (points: number, outer: number, inner: number): string =>
  polyPoints(
    Array.from({ length: points * 2 }, (_, k) => {
      const a = -Math.PI / 2 + (k * Math.PI) / points;
      const rad = k % 2 === 0 ? outer : inner;
      return [12 + rad * Math.cos(a), 12 + rad * Math.sin(a)] as [number, number];
    })
  );

const crossBase = (arm: number, reach: number): Array<[number, number]> => [
  [-arm, -reach], [arm, -reach], [arm, -arm],
  [reach, -arm], [reach, arm], [arm, arm],
  [arm, reach], [-arm, reach], [-arm, arm],
  [-reach, arm], [-reach, -arm], [-arm, -arm]
];

const crossPoints = (arm: number, reach: number, rotateDeg = 0): string => {
  const rad = (rotateDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return polyPoints(crossBase(arm, reach).map(([x, y]) => [12 + x * cos - y * sin, 12 + x * sin + y * cos]));
};

interface CategoryShapeMarkProps {
  shape: CategoryShape;
  tone?: CategoryTone;
  className?: string;
}

/**
 * Exact SVG preview of the PDF digest's vector category marker (`utils/pdf/kit.ts` → `categoryMark`),
 * using the same RGB accent colour printed in the PDF.
 */
const CategoryShapeMark: React.FC<CategoryShapeMarkProps> = ({ shape, tone = 'other', className = 'w-4 h-4 shrink-0' }) => {
  const [r, g, b] = TONE_RGB[tone]?.accent ?? TONE_RGB.other.accent;
  const accent = `rgb(${r}, ${g}, ${b})`;

  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      {shape === 'circle' && <circle cx="12" cy="12" r="8" fill={accent} />}
      {shape === 'ring' && <circle cx="12" cy="12" r="6.8" fill="white" stroke={accent} strokeWidth="3.2" />}
      {shape === 'square' && <rect x="5" y="5" width="14" height="14" fill={accent} />}
      {shape === 'squareRing' && <rect x="6" y="6" width="12" height="12" fill="white" stroke={accent} strokeWidth="3.2" />}
      {shape === 'triangle' && <polygon points={polyPoints([[12, 3.6], [20.4, 18.4], [3.6, 18.4]])} fill={accent} />}
      {shape === 'triangleRing' && <polygon points={polyPoints([[12, 5], [19.4, 18], [4.6, 18]])} fill="white" stroke={accent} strokeWidth="3" strokeLinejoin="round" />}
      {shape === 'triangleDown' && <polygon points={polyPoints([[3.6, 5.6], [20.4, 5.6], [12, 20.4]])} fill={accent} />}
      {shape === 'triangleRight' && <polygon points={polyPoints([[5.6, 3.6], [20.4, 12], [5.6, 20.4]])} fill={accent} />}
      {shape === 'triangleLeft' && <polygon points={polyPoints([[18.4, 3.6], [18.4, 20.4], [3.6, 12]])} fill={accent} />}
      {shape === 'diamond' && <polygon points={polyPoints([[12, 2.8], [21.2, 12], [12, 21.2], [2.8, 12]])} fill={accent} />}
      {shape === 'diamondRing' && <polygon points={polyPoints([[12, 4.2], [19.8, 12], [12, 19.8], [4.2, 12]])} fill="white" stroke={accent} strokeWidth="3" strokeLinejoin="round" />}
      {shape === 'hexagon' && <polygon points={regularPoly(6, 8.6, Math.PI / 6)} fill={accent} />}
      {shape === 'pentagon' && <polygon points={regularPoly(5, 8.8, -Math.PI / 2)} fill={accent} />}
      {shape === 'star' && <polygon points={starPoints(5, 9.2, 4.1)} fill={accent} />}
      {shape === 'spark' && <polygon points={starPoints(4, 9.4, 3.5)} fill={accent} />}
      {shape === 'cross' && <polygon points={crossPoints(2.9, 8.6, 0)} fill={accent} />}
      {shape === 'xMark' && <polygon points={crossPoints(2.9, 8.6, 45)} fill={accent} />}
      {shape === 'octagon' && <polygon points={regularPoly(8, 8.6, Math.PI / 8)} fill={accent} />}
      {shape === 'shield' && <polygon points={polyPoints([[5.2, 4.8], [18.8, 4.8], [18.8, 12.4], [12, 20.8], [5.2, 12.4]])} fill={accent} />}
      {shape === 'hourglass' && <polygon points={polyPoints([[4.6, 4.4], [19.4, 4.4], [14, 12], [19.4, 19.6], [4.6, 19.6], [10, 12]])} fill={accent} />}
    </svg>
  );
};

export default CategoryShapeMark;
