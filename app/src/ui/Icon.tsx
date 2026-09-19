import type { LucideProps } from 'lucide-react-native';
import ArrowDown from 'lucide-react-native/icons/arrow-down';
import ArrowUp from 'lucide-react-native/icons/arrow-up';
import Ellipsis from 'lucide-react-native/icons/ellipsis';
import Pencil from 'lucide-react-native/icons/pencil';
import Play from 'lucide-react-native/icons/play';
import Search from 'lucide-react-native/icons/search';
import Settings from 'lucide-react-native/icons/settings';
import Star from 'lucide-react-native/icons/star';
import Timer from 'lucide-react-native/icons/timer';
import Trophy from 'lucide-react-native/icons/trophy';
import Zap from 'lucide-react-native/icons/zap';
import Activity from 'lucide-react-native/icons/activity';
import ArrowRight from 'lucide-react-native/icons/arrow-right';
import Check from 'lucide-react-native/icons/check';
import ChevronLeft from 'lucide-react-native/icons/chevron-left';
import ChevronRight from 'lucide-react-native/icons/chevron-right';
import Cloud from 'lucide-react-native/icons/cloud';
import CloudOff from 'lucide-react-native/icons/cloud-off';
import Droplet from 'lucide-react-native/icons/droplet';
import Dumbbell from 'lucide-react-native/icons/dumbbell';
import Flame from 'lucide-react-native/icons/flame';
import Flag from 'lucide-react-native/icons/flag';
import House from 'lucide-react-native/icons/house';
import Info from 'lucide-react-native/icons/info';
import LayoutGrid from 'lucide-react-native/icons/layout-grid';
import LineChart from 'lucide-react-native/icons/chart-line';
import LogOut from 'lucide-react-native/icons/log-out';
import Mail from 'lucide-react-native/icons/mail';
import Minus from 'lucide-react-native/icons/minus';
import Palette from 'lucide-react-native/icons/palette';
import Plus from 'lucide-react-native/icons/plus';
import RefreshCw from 'lucide-react-native/icons/refresh-cw';
import Ruler from 'lucide-react-native/icons/ruler';
import Scale from 'lucide-react-native/icons/scale';
import Sparkles from 'lucide-react-native/icons/sparkles';
import Target from 'lucide-react-native/icons/target';
import Trash from 'lucide-react-native/icons/trash';
import TriangleAlert from 'lucide-react-native/icons/triangle-alert';
import User from 'lucide-react-native/icons/user';
import Camera from 'lucide-react-native/icons/camera';
import Utensils from 'lucide-react-native/icons/utensils';
import X from 'lucide-react-native/icons/x';
import Bike from 'lucide-react-native/icons/bike';
import Footprints from 'lucide-react-native/icons/footprints';
import Heart from 'lucide-react-native/icons/heart';
import HeartPulse from 'lucide-react-native/icons/heart-pulse';
import Moon from 'lucide-react-native/icons/moon';
import Pause from 'lucide-react-native/icons/pause';
import Pill from 'lucide-react-native/icons/pill';
import Award from 'lucide-react-native/icons/award';
import ChevronDown from 'lucide-react-native/icons/chevron-down';
import Crown from 'lucide-react-native/icons/crown';
import Lock from 'lucide-react-native/icons/lock';
import Medal from 'lucide-react-native/icons/medal';
import Share2 from 'lucide-react-native/icons/share-2';
import Mountain from 'lucide-react-native/icons/mountain';
import Navigation from 'lucide-react-native/icons/navigation';
import Square from 'lucide-react-native/icons/square';
import Volume2 from 'lucide-react-native/icons/volume-2';
import Watch from 'lucide-react-native/icons/watch';
import Bluetooth from 'lucide-react-native/icons/bluetooth';

const ICONS = {
  activity: Activity,
  arrowDown: ArrowDown,
  arrowUp: ArrowUp,
  more: Ellipsis,
  pencil: Pencil,
  play: Play,
  search: Search,
  settings: Settings,
  star: Star,
  timer: Timer,
  trophy: Trophy,
  zap: Zap,
  arrowRight: ArrowRight,
  check: Check,
  chevronLeft: ChevronLeft,
  chevronRight: ChevronRight,
  cloud: Cloud,
  cloudOff: CloudOff,
  droplet: Droplet,
  dumbbell: Dumbbell,
  flame: Flame,
  flag: Flag,
  home: House,
  info: Info,
  grid: LayoutGrid,
  chart: LineChart,
  logOut: LogOut,
  mail: Mail,
  minus: Minus,
  palette: Palette,
  plus: Plus,
  refresh: RefreshCw,
  ruler: Ruler,
  scale: Scale,
  sparkles: Sparkles,
  target: Target,
  trash: Trash,
  warning: TriangleAlert,
  user: User,
  utensils: Utensils,
  camera: Camera,
  close: X,
  bike: Bike,
  footprints: Footprints,
  heart: Heart,
  heartPulse: HeartPulse,
  moon: Moon,
  pause: Pause,
  pill: Pill,
  chevronDown: ChevronDown,
  award: Award,
  crown: Crown,
  lock: Lock,
  medal: Medal,
  share: Share2,
  mountain: Mountain,
  navigation: Navigation,
  square: Square,
  volume: Volume2,
  watch: Watch,
  bluetooth: Bluetooth,
} as const;

export type IconName = keyof typeof ICONS;

export function Icon({ name, size = 22, strokeWidth = 2, ...rest }: { name: IconName } & LucideProps) {
  const Component = ICONS[name];
  return <Component size={size} strokeWidth={strokeWidth} {...rest} />;
}
