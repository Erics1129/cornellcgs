"""Acceptance check: every transform name the view resolves with Find() still exists in each prefab (giant-update characters).

Compares the m_Name entries of every actor prefab at a baseline commit with the working tree:
  python3 unity/CarrotDefense/Tools/check_view_part_names.py [baseline-commit]   (run from the repository root)
"""
import re, subprocess, sys, glob, os
BASE = sys.argv[1] if len(sys.argv) > 1 else '48d1336'
VIEW = {'Turret', 'Core', 'Barrel', 'Petals', 'Pages', 'Muzzle', 'Ring01', 'Ring02', 'Ring03', 'Bell01', 'Bell02', 'Bell03', 'Bell04', 'Bell05',
        'FunnelTier0', 'FunnelTier1', 'FunnelTier2', 'FunnelTier3', 'FunnelTier4', 'DebrisRing0', 'DebrisRing1', 'DebrisRing2', 'UpperLid', 'LowerLid',
        'Pupil', 'Iris', 'IrisRing', 'Leaves', 'BitePatch', 'ArmL', 'ArmR', 'EyeL', 'EyeR', 'MouthSmile', 'MouthHurt', 'MouthHappy',
        'Spears', 'Pods', 'Stamen', 'Coils', 'Cap', 'Spines', 'ClockHands', 'Orbits', 'Eyeball', 'Claw0', 'Claw1', 'Claw2', 'Claw3', 'Drum',
        'Lantern', 'Shell', 'Staff'} | {'Tentacle%d' % i for i in range(6)}
names = lambda text: set(re.findall(r'm_Name: (\S+)', text))
root = 'unity/CarrotDefense/Assets/Resources/Carrot/Models/'
missing = []; checked = 0
for path in sorted(glob.glob(root + '**/*.prefab', recursive=True)):
    try:
        old = subprocess.run(['git', 'show', BASE + ':' + path], capture_output=True, text=True, check=True).stdout
    except subprocess.CalledProcessError:
        continue
    want = names(old) & VIEW; have = names(open(path).read())
    checked += 1
    for n in sorted(want - have):
        missing.append(os.path.basename(path) + ':' + n)
print('VIEW_PART_NAMES prefabs=%d missing=%d %s' % (checked, len(missing), ' '.join(missing[:20])))
print('VIEW_PART_NAMES', 'PASS' if not missing else 'FAIL')
sys.exit(1 if missing else 0)
