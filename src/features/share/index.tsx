import { Share } from 'lucide-react-native';
import type React from 'react';
import { useState } from 'react';

import type { WeeklyRecap } from '@/lib/insights';
import { useTheme } from '@/theme';
import { Button, IconButton } from '@/ui';
import type { ISODate } from '@/types';

import { dayCardContent, weekCardContent } from './content';
import { dayScene, weekScene } from './scene';
import { ShareSheet } from './ShareSheet';
import { useShareDayInput, useShareWeekInput } from './useShareData';

export { DEFAULT_SHARE_CHOICES, dayCardContent, weekCardContent, type ShareChoices } from './content';

function DaySheet({ date, visible, onClose }: { date: ISODate; visible: boolean; onClose: () => void }) {
  const { colors } = useTheme();
  const input = useShareDayInput(date);
  return (
    <ShareSheet
      visible={visible}
      onClose={onClose}
      kind="day"
      title="Share your day"
      testID="share-day-sheet"
      plan={(choices) => {
        const content = dayCardContent(input, choices);
        return { scene: dayScene(content, colors), summary: content.summary, fileName: `healthcal-${date}`, title: content.title };
      }}
    />
  );
}

/**
 * The share button for a day (Today's Now card in the late evening, the diary's summary, the morning page's header).
 * It opens the share sheet for that day: a portrait card of the day's cup in the current theme, with the person
 * choosing what it carries (no weight, ever; calorie numbers and food names only when they add them). `size` draws the
 * cup smaller where a row is shorter (the diary's narrow summary); the kit's `IconButton` keeps it 44 px to touch.
 * With `title` it is a worded small kit Button instead ("Share", `variant` secondary or ghost), named by its words
 * first ("Share the day as an image").
 */
export function ShareDayButton({
  date,
  testID = 'today-share',
  size = 44,
  title,
  variant = 'secondary',
  icon = true,
}: {
  date: string;
  testID?: string;
  size?: number;
  title?: string;
  variant?: 'secondary' | 'ghost';
  /** With `title`: false leaves the share glyph out, where a row is short of room (Today's Now card under 360 px). */
  icon?: boolean;
}): React.ReactElement | null {
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);
  // Mounted on first use only (the sheet reads a week of data), then kept so it can slide away.
  const [used, setUsed] = useState(false);
  const press = () => {
    setUsed(true);
    setOpen(true);
  };
  return (
    <>
      {title ? (
        <Button
          testID={testID}
          title={title}
          accessibilityLabel={`${title} the day as an image`}
          variant={variant}
          size="sm"
          full={false}
          icon={icon ? <Share size={18} color={variant === 'ghost' ? colors.actionInk : colors.text} strokeWidth={2.2} /> : undefined}
          onPress={press}
          style={{ maxWidth: '100%', ...(variant === 'ghost' ? { paddingHorizontal: 8 } : null) }}
        />
      ) : (
        <IconButton testID={testID} size={size} accessibilityLabel="Share your day as an image" onPress={press}>
          <Share size={size < 44 ? 18 : 20} color={colors.text} strokeWidth={1.9} />
        </IconButton>
      )}
      {used ? <DaySheet date={date as ISODate} visible={open} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

function WeekSheet({ recap, visible, onClose }: { recap: WeeklyRecap; visible: boolean; onClose: () => void }) {
  const { colors } = useTheme();
  const input = useShareWeekInput(recap);
  return (
    <ShareSheet
      visible={visible}
      onClose={onClose}
      kind="week"
      title="Share your week"
      testID="share-week-sheet"
      plan={(choices) => {
        const content = weekCardContent(input, choices);
        return { scene: weekScene(content, colors), summary: content.summary, fileName: `healthcal-week-${recap.weekStart}`, title: content.title };
      }}
    />
  );
}

/** The recap's share button: a week card of seven cups, with the same privacy rules as the day card. */
export function ShareWeekButton({ recap }: { recap: WeeklyRecap }): React.ReactElement {
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);
  // Mounted on first use only (the sheet reads a week of data), then kept so it can slide away.
  const [used, setUsed] = useState(false);
  return (
    <>
      <IconButton testID="recap-share" accessibilityLabel="Share your week as an image" onPress={() => {
          setUsed(true);
          setOpen(true);
        }}>
        <Share size={20} color={colors.text} strokeWidth={1.9} />
      </IconButton>
      {used ? <WeekSheet recap={recap} visible={open} onClose={() => setOpen(false)} /> : null}
    </>
  );
}
