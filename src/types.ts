// ---------------------------------------------------------------------------
// Kamva document model
// ---------------------------------------------------------------------------

export type Unit = 'px' | 'in' | 'mm' | 'cm';

export interface GradientStop {
  offset: number; // 0..1
  color: string; // any CSS colour (hex/rgba)
}

export type Fill =
  | { type: 'solid'; color: string }
  | { type: 'linear'; angle: number; stops: GradientStop[] }
  | { type: 'radial'; stops: GradientStop[] };

export interface Shadow {
  enabled: boolean;
  color: string;
  blur: number;
  offsetX: number;
  offsetY: number;
  opacity: number;
}

export type AnimationType =
  | 'none'
  | 'fade'
  | 'rise'
  | 'drop'
  | 'slideLeft'
  | 'slideRight'
  | 'pop'
  | 'zoomIn'
  | 'zoomOut'
  | 'spin'
  | 'bounce'
  | 'blur'
  | 'wipe'
  | 'typewriter'
  | 'pulse'
  | 'wiggle';

export interface ElementAnimation {
  enter: AnimationType;
  enterDuration: number; // seconds
  exit: AnimationType;
  exitDuration: number;
  loop: 'none' | 'pulse' | 'wiggle' | 'float' | 'rotate';
}

export interface ImageAdjust {
  brightness: number; // -100..100
  contrast: number; // -100..100
  saturation: number; // -100..100
  hue: number; // -180..180
  temperature: number; // -100..100
  tint: number; // -100..100
  blur: number; // 0..100
  vignette: number; // 0..100
  sepia: number; // 0..100
  grayscale: number; // 0..100
  invert: number; // 0..100
  sharpen: number; // 0..100
  highlights: number; // -100..100
  shadows: number; // -100..100
  grain: number; // 0..100
}

export interface Crop {
  // fraction of the source media, 0..1
  x: number;
  y: number;
  w: number;
  h: number;
}

export type BlendMode =
  | 'source-over'
  | 'multiply'
  | 'screen'
  | 'overlay'
  | 'darken'
  | 'lighten'
  | 'color-dodge'
  | 'color-burn'
  | 'hard-light'
  | 'soft-light'
  | 'difference'
  | 'exclusion'
  | 'hue'
  | 'saturation'
  | 'color'
  | 'luminosity';

export type ShapeKind =
  | 'rect'
  | 'roundRect'
  | 'ellipse'
  | 'triangle'
  | 'rightTriangle'
  | 'diamond'
  | 'pentagon'
  | 'hexagon'
  | 'octagon'
  | 'star'
  | 'star4'
  | 'star8'
  | 'burst'
  | 'heart'
  | 'arrowRight'
  | 'arrowLeft'
  | 'arrowUp'
  | 'arrowDown'
  | 'chevron'
  | 'cross'
  | 'speech'
  | 'cloud'
  | 'ring'
  | 'arch'
  | 'parallelogram'
  | 'trapezoid'
  | 'blob1'
  | 'blob2'
  | 'blob3'
  | 'moon'
  | 'lightning'
  | 'drop'
  | 'shield'
  | 'tag'
  | 'semicircle';

export type MaskKind = 'none' | ShapeKind;

interface BaseElement {
  id: string;
  name?: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number; // degrees, around centre
  opacity: number; // 0..1
  flipX?: boolean;
  flipY?: boolean;
  locked?: boolean;
  hidden?: boolean;
  groupId?: string | null;
  blendMode?: BlendMode;
  shadow?: Shadow;
  animation?: ElementAnimation;
  /** When the element is visible within its page, in seconds from page start. */
  timing?: { start: number; end: number | null };
  link?: string;
}

export interface ShapeElement extends BaseElement {
  type: 'shape';
  shape: ShapeKind;
  fill: Fill;
  stroke: string;
  strokeWidth: number;
  strokeDash: 'solid' | 'dashed' | 'dotted';
  cornerRadius: number;
  /** Optional text placed inside the shape */
  text?: string;
  textStyle?: Partial<TextStyle>;
}

export type LineEnd = 'none' | 'arrow' | 'triangle' | 'circle' | 'square' | 'bar';

export interface LineElement extends BaseElement {
  type: 'line';
  // A line runs horizontally across `width`, centred vertically; `rotation` angles it.
  stroke: string;
  strokeWidth: number;
  strokeDash: 'solid' | 'dashed' | 'dotted';
  lineCap: 'butt' | 'round' | 'square';
  start: LineEnd;
  end: LineEnd;
  curve: number; // -1..1, 0 = straight
}

export interface TextStyle {
  fontFamily: string;
  fontSize: number;
  fontWeight: 'normal' | 'bold';
  fontStyle: 'normal' | 'italic';
  underline: boolean;
  strike: boolean;
  fill: Fill;
  align: 'left' | 'center' | 'right' | 'justify';
  verticalAlign: 'top' | 'middle' | 'bottom';
  lineHeight: number;
  letterSpacing: number;
  transform: 'none' | 'uppercase' | 'lowercase' | 'capitalize';
  list: 'none' | 'bullet' | 'number';
}

export interface TextEffect {
  type: 'none' | 'outline' | 'hollow' | 'highlight' | 'glow' | 'lift' | 'echo' | 'neon' | 'splice';
  color: string;
  size: number; // effect size / thickness
  offset: number;
}

export interface TextElement extends BaseElement, TextStyle {
  type: 'text';
  text: string;
  effect: TextEffect;
  curve: number; // 0 = straight, -100..100
  autoHeight: boolean;
  role?: 'heading' | 'subheading' | 'body';
}

export interface MediaCommon {
  assetId: string | null; // null = empty frame placeholder
  crop: Crop;
  adjust: ImageAdjust;
  filter: string; // preset id
  filterIntensity: number; // 0..1
  mask: MaskKind;
  cornerRadius: number;
  borderColor: string;
  borderWidth: number;
}

export interface ImageElement extends BaseElement, MediaCommon {
  type: 'image';
}

export interface VideoElement extends BaseElement, MediaCommon {
  type: 'video';
  trimStart: number; // seconds into the source
  trimEnd: number | null; // null = to end
  volume: number; // 0..1
  muted: boolean;
  loop: boolean;
  speed: number;
}

export interface SvgElement extends BaseElement {
  type: 'svg';
  svg: string; // markup
  colorMap: Record<string, string>; // original colour -> replacement
  strokeWidth?: number; // for stroke-based icons
  meta?: {
    kind: 'icon' | 'qr' | 'chart' | 'svg' | 'table';
    icon?: string;
    qr?: { value: string; fg: string; bg: string; margin: number };
    chart?: ChartSpec;
    table?: TableSpec;
  };
  keepRatio?: boolean;
}

export interface ChartSpec {
  type: 'bar' | 'column' | 'line' | 'area' | 'pie' | 'donut' | 'progress';
  labels: string[];
  values: number[];
  colors: string[];
  showLabels: boolean;
  showValues: boolean;
  textColor: string;
  fontFamily: string;
}

export interface TableSpec {
  rows: string[][];
  headerFill: string;
  headerColor: string;
  cellFill: string;
  altFill: string;
  textColor: string;
  borderColor: string;
  fontFamily: string;
  fontSize: number;
}

export interface DrawElement extends BaseElement {
  type: 'draw';
  // points are normalized to the element box (0..1)
  points: number[];
  stroke: string;
  strokeWidth: number; // in design px
  brush: 'pen' | 'marker' | 'highlighter';
  // original box the points were captured in, so stroke can scale sensibly
  baseWidth: number;
  baseHeight: number;
}

export type DesignElement =
  | ShapeElement
  | LineElement
  | TextElement
  | ImageElement
  | VideoElement
  | SvgElement
  | DrawElement;

export type ElementType = DesignElement['type'];

export type TransitionType =
  | 'none'
  | 'fade'
  | 'dissolve'
  | 'slideLeft'
  | 'slideRight'
  | 'slideUp'
  | 'slideDown'
  | 'zoom'
  | 'wipeLeft'
  | 'wipeRight'
  | 'circle'
  | 'spin'
  | 'blur'
  | 'flash';

export interface PageBackground {
  fill: Fill;
  assetId?: string | null; // background image/video
  adjust?: ImageAdjust;
  filter?: string;
  filterIntensity?: number;
}

export interface Guide {
  id: string;
  axis: 'x' | 'y';
  pos: number;
}

export interface Page {
  id: string;
  name?: string;
  background: PageBackground;
  elements: DesignElement[];
  duration: number; // seconds (used in video/presentation mode)
  transition: { type: TransitionType; duration: number };
  notes?: string;
  guides?: Guide[];
  hidden?: boolean;
}

export interface AudioTrack {
  id: string;
  assetId: string;
  name: string;
  start: number; // seconds on the design timeline
  trimStart: number; // seconds into the source
  trimEnd: number | null;
  volume: number; // 0..1.5
  fadeIn: number;
  fadeOut: number;
  muted: boolean;
  lane: number;
}

export type AssetKind = 'image' | 'video' | 'audio' | 'font' | 'svg';

export interface AssetMeta {
  id: string;
  kind: AssetKind;
  name: string;
  mime: string;
  width?: number;
  height?: number;
  duration?: number;
  fontFamily?: string;
  size?: number;
}

export interface Design {
  id: string;
  name: string;
  width: number; // px
  height: number; // px
  unit: Unit;
  dpi: number;
  fps: number;
  category?: string;
  pages: Page[];
  audio: AudioTrack[];
  assets: Record<string, AssetMeta>;
  createdAt: number;
  updatedAt: number;
  version: number;
}

export interface BrandKit {
  id: string;
  name: string;
  colors: string[];
  palettes?: { name: string; colors: string[] }[];
  fonts: { heading: string; subheading: string; body: string };
  logos: { id: string; name: string; dataUrl: string }[];
}

export interface Template {
  id: string;
  name: string;
  category: string;
  width: number;
  height: number;
  pages: Page[];
  audio?: AudioTrack[];
  thumb?: string;
  builtIn?: boolean;
  tags?: string[];
  assets?: Record<string, AssetMeta>;
  assetData?: Record<string, string>; // data URLs for user templates
}
