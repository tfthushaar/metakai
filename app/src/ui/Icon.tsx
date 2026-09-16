import type { LucideProps } from 'lucide-react-native';
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
import Utensils from 'lucide-react-native/icons/utensils';
import X from 'lucide-react-native/icons/x';

const ICONS = {
  activity: Activity,
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
  close: X,
} as const;

export type IconName = keyof typeof ICONS;

export function Icon({ name, size = 22, strokeWidth = 2, ...rest }: { name: IconName } & LucideProps) {
  const Component = ICONS[name];
  return <Component size={size} strokeWidth={strokeWidth} {...rest} />;
}
