// Icons of the Cast player as inline SVG (paths of Material Icons), so the widget does not depend on an icon the host
// may or may not share through Module Federation.
import { React } from '@iobroker/dm-widgets';
import type { CSSProperties } from 'react';

export interface SvgIconProps {
    size?: number | string;
    style?: CSSProperties;
}

function createIcon(path: string, name: string): (props: SvgIconProps) => React.JSX.Element {
    const Icon = ({ size = 24, style }: SvgIconProps): React.JSX.Element => (
        <svg
            viewBox="0 0 24 24"
            width={size}
            height={size}
            fill="currentColor"
            aria-hidden="true"
            style={{ flex: '0 0 auto', ...style }}
        >
            <path d={path} />
        </svg>
    );
    Icon.displayName = name;
    return Icon;
}

export const PlayIcon = createIcon('M8 5v14l11-7z', 'PlayIcon');

export const PauseIcon = createIcon('M6 19h4V5H6v14zm8-14v14h4V5h-4z', 'PauseIcon');

export const StopIcon = createIcon('M6 6h12v12H6z', 'StopIcon');

export const CastIcon = createIcon(
    'M21 3H3c-1.1 0-2 .9-2 2v3h2V5h18v14h-7v2h7c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zM1 18v3h3c0-1.66-1.34-3-3-3zm0-4v2c2.76 0 5 2.24 5 5h2c0-3.87-3.13-7-7-7zm0-4v2c4.97 0 9 4.03 9 9h2c0-6.08-4.93-11-11-11z',
    'CastIcon',
);

export const MusicIcon = createIcon(
    'M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z',
    'MusicIcon',
);
