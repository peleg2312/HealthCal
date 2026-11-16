/**
 * A small Health app export, written the way the Health app writes one, for
 * the tests (test-only: nothing in the app imports it). Both generations of
 * <Workout> appear, with heart rate, sleep and the <Me> element as the noise
 * that must be skipped, and the person's own device names in sourceName.
 */

export interface FixtureStep {
  source: string;
  device?: string;
  start: string;
  end: string;
  value: number;
}

const WATCH_DEVICE = '&lt;&lt;HKDevice: 0x283a1c0f0&gt;, name:Apple Watch, manufacturer:Apple Inc., model:Watch, hardware:Watch6,1, software:10.1&gt;';
const PHONE_DEVICE = '&lt;&lt;HKDevice: 0x283a1c2d0&gt;, name:iPhone, manufacturer:Apple Inc., model:iPhone, hardware:iPhone15,2, software:17.1&gt;';

export const DEVICES = { watch: WATCH_DEVICE, phone: PHONE_DEVICE };

const DTD = `<!DOCTYPE HealthData [
<!-- HealthKit Export Version: 14 -->
<!ELEMENT HealthData (ExportDate,Me,(Record|Correlation|Workout|ActivitySummary|ClinicalRecord|Audiogram|VisionPrescription)*)>
<!ATTLIST HealthData
  locale CDATA #REQUIRED
>
<!ELEMENT Workout ((MetadataEntry|WorkoutEvent|WorkoutRoute|WorkoutStatistics)*)>
]>`;

export function stepRecord(s: FixtureStep): string {
  return ` <Record type="HKQuantityTypeIdentifierStepCount" sourceName="${s.source}" sourceVersion="17.1" device="${s.device ?? PHONE_DEVICE}" unit="count" creationDate="${s.end}" startDate="${s.start}" endDate="${s.end}" value="${s.value}"/>\n`;
}

export function heartRecord(at: string): string {
  return ` <Record type="HKQuantityTypeIdentifierHeartRate" sourceName="Dana’s Apple Watch" sourceVersion="10.1" device="${WATCH_DEVICE}" unit="count/min" creationDate="${at}" startDate="${at}" endDate="${at}" value="72">\n  <MetadataEntry key="HKMetadataKeyHeartRateMotionContext" value="0"/>\n </Record>\n`;
}

/** iOS 16 and later: energy and distance in WorkoutStatistics, an activity inside, a route, events. */
export function newWorkout(o: { type: string; start: string; end: string; source?: string; device?: string; kcal?: number; kcalUnit?: string; distance?: number; distanceUnit?: string; distanceType?: string; metadata?: Record<string, string> }): string {
  const meta = Object.entries(o.metadata ?? {})
    .map(([k, v]) => `  <MetadataEntry key="${k}" value="${v}"/>\n`)
    .join('');
  const stats = [
    o.kcal !== undefined ? `  <WorkoutStatistics type="HKQuantityTypeIdentifierActiveEnergyBurned" startDate="${o.start}" endDate="${o.end}" sum="${o.kcal}" unit="${o.kcalUnit ?? 'Cal'}"/>\n` : '',
    `  <WorkoutStatistics type="HKQuantityTypeIdentifierBasalEnergyBurned" startDate="${o.start}" endDate="${o.end}" sum="61.2" unit="Cal"/>\n`,
    o.distance !== undefined ? `  <WorkoutStatistics type="${o.distanceType ?? 'HKQuantityTypeIdentifierDistanceWalkingRunning'}" startDate="${o.start}" endDate="${o.end}" sum="${o.distance}" unit="${o.distanceUnit ?? 'km'}"/>\n` : '',
    `  <WorkoutStatistics type="HKQuantityTypeIdentifierHeartRate" startDate="${o.start}" endDate="${o.end}" average="141" minimum="98" maximum="172" unit="count/min"/>\n`,
  ].join('');
  return (
    ` <Workout workoutActivityType="${o.type}" duration="30" durationUnit="min" sourceName="${o.source ?? 'Dana’s Apple Watch'}" sourceVersion="10.1" device="${o.device ?? WATCH_DEVICE}" creationDate="${o.end}" startDate="${o.start}" endDate="${o.end}">\n` +
    meta +
    `  <WorkoutEvent type="HKWorkoutEventTypeSegment" date="${o.start}" duration="10" durationUnit="min"/>\n` +
    `  <WorkoutActivity uuid="A1B2" startDate="${o.start}" endDate="${o.end}" duration="30" durationUnit="min">\n` +
    `   <WorkoutEvent type="HKWorkoutEventTypePause" date="${o.start}" duration="0" durationUnit="min"/>\n` +
    (o.kcal !== undefined ? `   <WorkoutStatistics type="HKQuantityTypeIdentifierActiveEnergyBurned" startDate="${o.start}" endDate="${o.end}" sum="${o.kcal}" unit="${o.kcalUnit ?? 'Cal'}"/>\n` : '') +
    `   <MetadataEntry key="HKIndoorWorkout" value="1"/>\n` +
    `  </WorkoutActivity>\n` +
    stats +
    `  <WorkoutRoute sourceName="Dana’s Apple Watch" sourceVersion="10.1" creationDate="${o.end}" startDate="${o.start}" endDate="${o.end}">\n   <MetadataEntry key="HKMetadataKeySyncVersion" value="2"/>\n   <FileReference path="/workout-routes/route_2026-11-15_10.30am.gpx"/>\n  </WorkoutRoute>\n` +
    ` </Workout>\n`
  );
}

/** Before iOS 16: totals on the element itself. */
export function oldWorkout(o: { type: string; start: string; end: string; source?: string; device?: string; kcal?: number; kcalUnit?: string; distance?: number; distanceUnit?: string; minutes?: number }): string {
  const dist = o.distance !== undefined ? ` totalDistance="${o.distance}" totalDistanceUnit="${o.distanceUnit ?? 'km'}"` : '';
  const kcal = o.kcal !== undefined ? ` totalEnergyBurned="${o.kcal}" totalEnergyBurnedUnit="${o.kcalUnit ?? 'kcal'}"` : '';
  const device = o.device === '' ? '' : ` device="${o.device ?? WATCH_DEVICE}"`;
  return ` <Workout workoutActivityType="${o.type}" duration="${o.minutes ?? 30}" durationUnit="min"${dist}${kcal} sourceName="${o.source ?? 'Dana’s Apple Watch'}" sourceVersion="7.0"${device} creationDate="${o.end}" startDate="${o.start}" endDate="${o.end}">\n  <MetadataEntry key="HKTimeZone" value="Europe/Berlin"/>\n </Workout>\n`;
}

export function exportXml(body: string, exportDate = '2026-11-16 08:30:00 +0100'): string {
  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n${DTD}\n<HealthData locale="en_US">\n <ExportDate value="${exportDate}"/>\n` +
    ` <Me HKCharacteristicTypeIdentifierDateOfBirth="1990-04-02" HKCharacteristicTypeIdentifierBiologicalSex="HKBiologicalSexFemale" HKCharacteristicTypeIdentifierBloodType="HKBloodTypeNotSet" HKCharacteristicTypeIdentifierFitzpatrickSkinType="HKFitzpatrickSkinTypeNotSet" HKCharacteristicTypeIdentifierCardioFitnessMedicationsUse="None"/>\n` +
    body +
    ` <Record type="HKCategoryTypeIdentifierSleepAnalysis" sourceName="Dana’s Apple Watch" sourceVersion="10.1" creationDate="2026-11-15 07:00:00 +0100" startDate="2026-11-14 23:00:00 +0100" endDate="2026-11-15 06:30:00 +0100" value="HKCategoryValueSleepAnalysisAsleepCore"/>\n` +
    ` <ActivitySummary dateComponents="2026-11-15" activeEnergyBurned="512" activeEnergyBurnedGoal="500" activeEnergyBurnedUnit="Cal"/>\n` +
    `</HealthData>\n`
  );
}
