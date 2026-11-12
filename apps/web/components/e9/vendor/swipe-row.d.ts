import type { CSSProperties, ReactElement, ReactNode } from "react";

export type TSwipeAction = {
  id: string;
  label: string;
  icon?: ReactNode;
  color?: string;
  dismiss?: boolean;
  onSelect?: () => void;
};

export type TSwipeRowProps = {
  children?: ReactNode;
  actions?: TSwipeAction[];
  actionColor?: string;
  drawerColor?: string;
  rowColor?: string;
  textColor?: string;
  height?: number;
  radius?: number;
  actionWidth?: number;
  direction?: "left" | "right";
  snapBounce?: number;
  resistance?: number;
  collapseMs?: number;
  commitAt?: number;
  fullSwipe?: boolean;
  disabled?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  onAction?: (action: TSwipeAction) => void;
  onCommit?: (action: TSwipeAction) => void;
  closeOnAction?: boolean;
  haptic?: boolean;
  label?: string;
  className?: string;
  style?: CSSProperties;
};

declare const SwipeRow: (props: TSwipeRowProps) => ReactElement;
export default SwipeRow;
