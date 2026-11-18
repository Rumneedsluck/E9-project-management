import type { ReactElement } from "react";

export type TCometDialProps = {
  value?: number;
  defaultValue?: number;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  label?: string;
  accent?: string;
  ink?: string;
  size?: number;
  sweep?: number;
  thickness?: number;
  speed?: number;
  tapBounce?: number;
  flickBounce?: number;
  momentum?: number;
  cometReach?: number;
  cometWidth?: number;
  disabled?: boolean;
  onChange?: (value: number) => void;
  onChangeEnd?: (value: number, detail: { velocity: number; bounce: number }) => void;
  className?: string;
};

declare const CometDial: (props: TCometDialProps) => ReactElement;
export default CometDial;
