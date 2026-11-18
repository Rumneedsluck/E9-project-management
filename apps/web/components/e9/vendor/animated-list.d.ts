import type { CSSProperties, ReactElement, ReactNode } from "react";

export type TAnimatedListItem =
  | string
  | { id?: string | number; icon?: ReactNode; image?: string; title: string; description?: string; meta?: string };

export type TAnimatedListProps<T = TAnimatedListItem> = {
  items?: T[];
  onItemSelect?: (item: T, index: number) => void;
  renderItem?: (item: T, index: number, selected: boolean) => ReactNode;
  initialSelectedIndex?: number;
  selectOnHover?: boolean;
  enableArrowNavigation?: boolean;
  loop?: boolean;
  animation?: "pop" | "slide" | "fade" | "none";
  animateOnce?: boolean;
  stagger?: number;
  showGradients?: boolean;
  fadeSize?: number;
  displayScrollbar?: boolean;
  frame?: boolean;
  theme?: "dark" | "light";
  accentColor?: string;
  radius?: number;
  gap?: number;
  width?: number | string;
  maxHeight?: number | string;
  className?: string;
  itemClassName?: string;
  style?: CSSProperties;
};

declare function AnimatedList<T = TAnimatedListItem>(props: TAnimatedListProps<T>): ReactElement;
export default AnimatedList;
