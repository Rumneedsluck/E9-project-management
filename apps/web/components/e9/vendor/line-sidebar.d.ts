import type { ComponentType, ReactElement } from "react";

export type TLineSidebarItem = string | { label: string; href?: string; hint?: string };

export type TLineSidebarProps = {
  items?: TLineSidebarItem[];
  accentColor?: string;
  textColor?: string;
  markerColor?: string;
  showIndex?: boolean;
  showMarker?: boolean;
  proximityRadius?: number;
  maxShift?: number;
  falloff?: "linear" | "smooth" | "sharp";
  markerLength?: number;
  markerGap?: number;
  tickScale?: number;
  scaleTick?: boolean;
  itemGap?: number;
  fontSize?: number;
  smoothing?: number;
  defaultActive?: number | null;
  /** E9: the row to highlight (follows the page); leave out for the original click-to-select behaviour */
  activeIndex?: number | null;
  /** E9: renders rows that have an href (a router link) */
  LinkComponent?: ComponentType<any> | string;
  onItemClick?: (index: number, label: string) => void;
  className?: string;
};

declare const LineSidebar: (props: TLineSidebarProps) => ReactElement;
export default LineSidebar;
