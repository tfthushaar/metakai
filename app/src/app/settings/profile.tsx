import { useState } from 'react';
import { View } from 'react-native';

import { getProfile, saveProfile } from '../../core/db/repo';
import { useQuery } from '../../core/db/useQuery';
import { useSettings } from '../../core/store/settings';
import { SPACE } from '../../core/theme/typography';
import { dateKey } from '../../lib/dates';
import { ACTIVITY_LABEL, ageFromBirthDate, type ActivityLevel, type Sex } from '../../lib/energy';
import type { Experience } from '../../lib/goals';
import { cmToFtIn, ftInToCm } from '../../lib/units';
import { Button } from '../../ui/Button';
import { haptic } from '../../ui/haptics';
import { ListGroup, ListRow } from '../../ui/List';
import { Screen } from '../../ui/Screen';
import { SegmentedControl } from '../../ui/SegmentedControl';
import { Text } from '../../ui/Text';
import { TextField } from '../../ui/TextField';
import { toast } from '../../ui/Toast';

const EXPERIENCE: { value: Experience; label: string }[] = [
  { value: 'beginner', label: 'Beginner' },
  { value: 'intermediate', label: 'Intermediate' },
  { value: 'advanced', label: 'Advanced' },
];

export default function ProfileSettings() {
  const profile = useQuery(['profile'], getProfile);
  const units = useSettings((s) => s.units);

  const [name, setName] = useState(profile?.name ?? '');
  const [sex, setSex] = useState<Sex>(profile?.sex ?? 'male');
  const [age, setAge] = useState(String(profile ? ageFromBirthDate(profile.birthDate) : 25));
  const initialFtIn = cmToFtIn(profile?.heightCm ?? 175);
  const [heightCm, setHeightCm] = useState(String(Math.round(profile?.heightCm ?? 175)));
  const [ft, setFt] = useState(String(initialFtIn.ft));
  const [inches, setInches] = useState(String(initialFtIn.inches));
  const [activity, setActivity] = useState<ActivityLevel>(profile?.activity ?? 'moderate');
  const [experience, setExperience] = useState<Experience>(profile?.experience ?? 'beginner');
  const [bodyFat, setBodyFat] = useState(profile?.bodyFatPct != null ? String(profile.bodyFatPct) : '');

  if (!profile) {
    return (
      <Screen title="Profile" back>
        <Text tone="secondary">No profile yet.</Text>
      </Screen>
    );
  }

  const ageNum = Number(age);
  const height = units === 'metric' ? Number(heightCm) : ftInToCm(Number(ft), Number(inches));
  const bf = bodyFat.trim() === '' ? null : Number(bodyFat.replace(',', '.'));
  const valid = ageNum >= 13 && ageNum <= 100 && height >= 100 && height <= 250 && (bf == null || (bf >= 3 && bf <= 70));

  const save = () => {
    let birthDate = profile.birthDate;
    if (ageFromBirthDate(birthDate) !== ageNum) {
      const d = new Date();
      d.setFullYear(d.getFullYear() - ageNum);
      birthDate = dateKey(d);
    }
    saveProfile({ ...profile, name: name.trim() || null, sex, birthDate, heightCm: height, activity, experience, bodyFatPct: bf });
    haptic.success();
    toast('Profile saved. Targets updated.');
  };

  return (
    <Screen title="Profile" back>
      <View style={{ gap: SPACE.lg }}>
        <TextField label="Name" value={name} onChangeText={setName} placeholder="Optional" />
        <SegmentedControl<Sex>
          value={sex}
          onChange={setSex}
          segments={[
            { value: 'male', label: 'Male' },
            { value: 'female', label: 'Female' },
          ]}
        />
        <View style={{ flexDirection: 'row', gap: SPACE.md }}>
          <View style={{ flex: 1 }}>
            <TextField label="Age" value={age} onChangeText={setAge} keyboardType="number-pad" suffix="yrs" />
          </View>
          {units === 'metric' ? (
            <View style={{ flex: 1 }}>
              <TextField label="Height" value={heightCm} onChangeText={setHeightCm} keyboardType="decimal-pad" suffix="cm" />
            </View>
          ) : (
            <>
              <View style={{ flex: 1 }}>
                <TextField label="Height" value={ft} onChangeText={setFt} keyboardType="number-pad" suffix="ft" />
              </View>
              <View style={{ flex: 1 }}>
                <TextField label=" " value={inches} onChangeText={setInches} keyboardType="number-pad" suffix="in" />
              </View>
            </>
          )}
        </View>
        <TextField label="Body fat (optional)" value={bodyFat} onChangeText={setBodyFat} keyboardType="decimal-pad" suffix="%" placeholder="Leave empty if unsure" />
      </View>

      <ListGroup header="Activity">
        {(Object.keys(ACTIVITY_LABEL) as ActivityLevel[]).map((a) => (
          <ListRow key={a} title={ACTIVITY_LABEL[a].title} subtitle={ACTIVITY_LABEL[a].detail} selected={activity === a} chevron={false} onPress={() => setActivity(a)} />
        ))}
      </ListGroup>

      <ListGroup header="Training experience">
        {EXPERIENCE.map((e) => (
          <ListRow key={e.value} title={e.label} selected={experience === e.value} chevron={false} onPress={() => setExperience(e.value)} />
        ))}
      </ListGroup>

      <View style={{ marginTop: SPACE.xl }}>
        <Button title="Save" onPress={save} disabled={!valid} />
      </View>
    </Screen>
  );
}
