#!/usr/bin/env python3
"""
Calcula el total de slots disponibles por closer y por día.
Cada cita = 1 hora (45 min + buffers = 1h slot).
Un rango de 10AM-2PM = slots a las 10, 11, 12, 13 = 4 slots.
"""

from datetime import date, timedelta

def expand_dates(start_str, end_str):
    """Expande un rango de fechas en una lista de dates."""
    parts_s = start_str.split('-')
    parts_e = end_str.split('-')
    # Parse "Mar 25" etc
    months = {'Mar': 3, 'Apr': 4}
    
    s = date(2026, months[parts_s[0]], int(parts_s[1]))
    e = date(2026, months[parts_e[0]], int(parts_e[1]))
    result = []
    d = s
    while d <= e:
        result.append(d)
        d += timedelta(days=1)
    return result

def slots_from_ranges(ranges):
    """Dado una lista de (start_hour, end_hour), calcula cuántos slots de 1h caben."""
    total = 0
    for (s, e) in ranges:
        total += (e - s)  # cada hora es un slot
    return total

# Definir disponibilidad de cada closer
# Formato: { date: [(start_h, end_h), ...] }

closers = {}

# ── 1. FLORENCIA BLAZQUEZ ──
flor = {}
flor[date(2026,3,24)] = [(22,24)]  # 10PM-12AM
flor[date(2026,3,25)] = [(10,14),(16,21)]  # 10AM-2PM, 4PM-9PM
flor[date(2026,3,26)] = [(10,14),(16,19)]  # 10AM-2PM, 4PM-7PM
for d in [date(2026,3,27), date(2026,3,28)]:
    flor[d] = [(10,14),(16,21)]  # 10AM-2PM, 4PM-9PM
flor[date(2026,3,29)] = [(10,14),(16,19)]  # 10AM-2PM, 4PM-7PM
flor[date(2026,3,30)] = [(10,14),(16,20)]  # 10AM-2PM, 4PM-8PM
closers['Florencia Blazquez'] = flor

# ── 2. JORDI RUIZ CLOSER ──
jordi = {}
jordi[date(2026,3,24)] = [(22,24)]
for d_offset in range(0, 8):  # Mar 25 - Apr 1
    jordi[date(2026,3,25) + timedelta(days=d_offset)] = [(10,22)]  # 10AM-10PM
jordi[date(2026,4,2)] = [(10,17)]  # 10AM-5PM
jordi[date(2026,4,3)] = [(10,15),(16,22)]  # 10AM-3PM, 4PM-10PM
for d in [date(2026,4,4), date(2026,4,5)]:
    jordi[d] = [(10,22)]
jordi[date(2026,4,6)] = [(10,15),(16,22)]
jordi[date(2026,4,7)] = [(10,13),(14,22)]  # 10AM-1PM, 2PM-10PM
for d in [date(2026,4,8), date(2026,4,9)]:
    jordi[d] = [(10,22)]
jordi[date(2026,4,10)] = [(10,15),(16,22)]
for d in [date(2026,4,11), date(2026,4,12)]:
    jordi[d] = [(10,22)]
jordi[date(2026,4,13)] = [(10,15),(16,22)]
for d in [date(2026,4,15), date(2026,4,16)]:
    jordi[d] = [(10,22)]
jordi[date(2026,4,17)] = [(10,14),(16,22)]
closers['Jordi Ruiz'] = jordi

# ── 3. MARTA BRIZ ──
marta = {}
for d_offset in range(0, 5):  # Mar 25-29
    marta[date(2026,3,25) + timedelta(days=d_offset)] = [(10,14),(15,22)]
marta[date(2026,3,30)] = [(10,14),(15,22)]  # 12AM probably 12PM but let's use similar
for d_offset in range(0, 11):  # Mar 31 - Apr 10
    marta[date(2026,3,31) + timedelta(days=d_offset)] = [(10,14),(15,22)]
marta[date(2026,4,11)] = [(15,21)]  # 3PM-9PM
marta[date(2026,4,12)] = [(10,14),(15,18)]  # 10AM-2PM, 3PM-6PM
marta[date(2026,4,13)] = [(15,18)]  # 3PM-6PM
for d_offset in range(0, 4):  # Apr 14-17
    marta[date(2026,4,14) + timedelta(days=d_offset)] = [(15,21)]
closers['Marta Briz'] = marta

# ── 4. SALMA FIKRY ──
salma = {}
salma[date(2026,3,24)] = [(11,12)]  # 11AM-12PM
salma[date(2026,3,25)] = [(10,18),(19,22)]  # 10AM-6PM, 7PM-10PM
salma[date(2026,3,26)] = [(10,22)]  # 10AM-10PM
salma[date(2026,3,27)] = [(12,13),(15,22)]  # 12PM-1PM, 3PM-10PM
for d in [date(2026,3,28), date(2026,3,29)]:
    salma[d] = [(10,22)]
for d in [date(2026,3,30), date(2026,3,31)]:
    salma[d] = [(10,18),(19,22)]
salma[date(2026,4,1)] = [(10,22)]
salma[date(2026,4,3)] = [(10,11),(12,22)]  # 10AM-11AM, 12PM-10PM
for d in [date(2026,4,4), date(2026,4,5)]:
    salma[d] = [(10,22)]
for d_offset in range(0, 4):  # Apr 6-9
    salma[date(2026,4,6) + timedelta(days=d_offset)] = [(10,18),(19,22)]
for d in [date(2026,4,11), date(2026,4,12)]:
    salma[d] = [(10,22)]
for d_offset in range(0, 5):  # Apr 13-17
    salma[date(2026,4,13) + timedelta(days=d_offset)] = [(10,18),(19,22)]
closers['Salma Fikry'] = salma

# ── 5. SARAY VALLE ──
saray = {}
saray[date(2026,3,24)] = [(23,24)]  # 11PM-12AM
for d in [date(2026,3,25), date(2026,3,26), date(2026,3,27)]:
    saray[d] = [(10,14),(15,22)]  # 10AM-2PM, 3PM-10PM
for d in [date(2026,3,28), date(2026,3,29)]:
    saray[d] = [(10,14),(15,20)]  # 10AM-2PM, 3PM-8PM
closers['Saray Valle'] = saray

# ── 6. EDUARDO FOCUS ──
edu = {}
edu[date(2026,3,24)] = [(22,24)]  # 10PM-12AM
edu[date(2026,3,25)] = [(10,15),(16,22)]  # 10AM-3PM, 4PM-10PM
edu[date(2026,3,26)] = [(10,15),(17,22)]  # 10AM-3PM, 5PM-10PM
edu[date(2026,3,27)] = [(10,15),(16,19)]  # 10AM-3PM, 4PM-7PM
edu[date(2026,3,28)] = [(10,14),(16,19)]  # 10AM-2PM, 4PM-7PM
edu[date(2026,3,29)] = [(10,19)]  # 10AM-7PM
closers['Eduardo Focus'] = edu

# ── 7. CRISTOFER VENUS ──
cris = {}
for d in [date(2026,3,25), date(2026,3,26)]:
    cris[d] = [(10,22)]  # 10AM-10PM
cris[date(2026,3,27)] = [(10,17)]  # 10AM-5PM
for d_offset in range(0, 8):  # Mar 28 - Apr 4
    cris[date(2026,3,28) + timedelta(days=d_offset)] = [(10,22)]
closers['Cristofer Venus'] = cris

# ── 8. ALEJANDRO DOVAL ──
ale = {}
ale[date(2026,3,24)] = [(23,24)]  # 11PM-12AM
for d_offset in range(0, 22):  # Mar 25 - Apr 15
    ale[date(2026,3,25) + timedelta(days=d_offset)] = [(10,11),(12,18),(20,22)]
closers['Alejandro Doval'] = ale

# ── 9. EMILIO CANDAMIO ──
emi = {}
emi[date(2026,3,24)] = [(22,24)]  # 10PM-12AM
emi[date(2026,3,25)] = [(10,15),(17,20)]  # 10AM-3PM, 5PM-8PM
for d_offset in range(0, 7):  # Mar 26 - Apr 1
    emi[date(2026,3,26) + timedelta(days=d_offset)] = [(10,15),(17,21)]
for d_offset in range(0, 4):  # Apr 2-5
    emi[date(2026,4,2) + timedelta(days=d_offset)] = [(10,14)]
emi[date(2026,4,6)] = [(10,15),(17,19)]  # 10AM-3PM, 5PM-7PM
emi[date(2026,4,7)] = [(10,15),(17,20)]  # 10AM-3PM, 5PM-8PM
for d_offset in range(0, 10):  # Apr 8-17
    emi[date(2026,4,8) + timedelta(days=d_offset)] = [(10,17),(17,22)]  # ~10AM-10PM
closers['Emilio Candamio'] = emi


# ═══════════════════════════════════════════════
# CALCULAR TOTALES
# ═══════════════════════════════════════════════

# Recopilar todas las fechas
all_dates = set()
for c_data in closers.values():
    all_dates.update(c_data.keys())
all_dates = sorted(all_dates)

print("=" * 80)
print("SLOTS TOTALES POR DÍA (sumando todos los closers)")
print("=" * 80)

grand_total = 0
day_totals = {}

for d in all_dates:
    day_total = 0
    day_closers = []
    for name, c_data in closers.items():
        if d in c_data:
            s = slots_from_ranges(c_data[d])
            day_total += s
            day_closers.append(f"{name}({s})")
    day_totals[d] = day_total
    grand_total += day_total
    dow = ['lun','mar','mié','jue','vie','sáb','dom'][d.weekday()]
    print(f"  {d} ({dow}): {day_total:3d} slots  [{', '.join(day_closers)}]")

print(f"\n{'=' * 80}")
print(f"TOTAL GENERAL: {grand_total} slots")
print(f"{'=' * 80}")

# Desglose por closer
print(f"\nDESGLOSE POR CLOSER:")
print(f"{'-' * 50}")
for name, c_data in closers.items():
    total = sum(slots_from_ranges(ranges) for ranges in c_data.values())
    days = len(c_data)
    print(f"  {name:25s}: {total:4d} slots en {days:2d} días")

# Solo contar slots en horario útil (10-21h)
print(f"\n{'=' * 80}")
print(f"SLOTS SOLO EN HORARIO ÚTIL (10:00 - 21:00)")
print(f"{'=' * 80}")

useful_total = 0
for d in all_dates:
    day_useful = 0
    for name, c_data in closers.items():
        if d in c_data:
            for (s, e) in c_data[d]:
                # Clip to 10-21
                cs = max(s, 10)
                ce = min(e, 21)
                if ce > cs:
                    day_useful += (ce - cs)
    useful_total += day_useful
    dow = ['lun','mar','mié','jue','vie','sáb','dom'][d.weekday()]
    print(f"  {d} ({dow}): {day_useful:3d} slots útiles")

print(f"\nTOTAL SLOTS ÚTILES (10-21h): {useful_total}")
