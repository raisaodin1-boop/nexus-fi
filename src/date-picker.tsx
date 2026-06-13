/**
 * DatePicker — calendar with separate month/year selection.
 * Uses @react-native-community/datetimepicker on native,
 * falls back to a month/year grid on web.
 */
import React, { useMemo, useState } from "react";
import {
  Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View,
} from "react-native";
import { Colors, Radius } from "@/src/theme";

type PickerMode = "day" | "month" | "year";

interface Props {
  label?: string;
  value: Date | null;
  onChange: (date: Date) => void;
  minimumDate?: Date;
  maximumDate?: Date;
  testID?: string;
}

const MONTHS_FR = [
  "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
  "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre",
];

const MONTHS_SHORT = [
  "Jan", "Fév", "Mar", "Avr", "Mai", "Juin",
  "Juil", "Août", "Sep", "Oct", "Nov", "Déc",
];

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** Bornes pour date de naissance (passé uniquement, jusqu'à 120 ans). */
export function birthDateBounds() {
  const today = startOfDay(new Date());
  return {
    minimumDate: new Date(today.getFullYear() - 120, 0, 1),
    maximumDate: today,
  };
}

/** Bornes pour échéances futures (aujourd'hui → +N ans). */
export function futureDateBounds(yearsAhead = 30) {
  const today = startOfDay(new Date());
  return {
    minimumDate: today,
    maximumDate: new Date(today.getFullYear() + yearsAhead, 11, 31),
  };
}

function formatDate(d: Date | null): string {
  if (!d) return "Sélectionner une date";
  return `${d.getDate().toString().padStart(2, "0")} ${MONTHS_FR[d.getMonth()]} ${d.getFullYear()}`;
}

function clampViewYear(year: number, minY: number, maxY: number) {
  return Math.min(maxY, Math.max(minY, year));
}

export function DatePicker({ label, value, onChange, minimumDate, maximumDate, testID }: Props) {
  const today = startOfDay(new Date());
  const minBound = minimumDate ? startOfDay(minimumDate) : null;
  const maxBound = maximumDate ? startOfDay(maximumDate) : null;

  const minYear = minBound?.getFullYear() ?? today.getFullYear() - 120;
  const maxYear = maxBound?.getFullYear() ?? today.getFullYear();

  const [open, setOpen] = useState(false);
  const [pickerMode, setPickerMode] = useState<PickerMode>("day");
  const [viewYear, setViewYear] = useState(() =>
    clampViewYear(value?.getFullYear() ?? today.getFullYear() - 25, minYear, maxYear),
  );
  const [viewMonth, setViewMonth] = useState(() => value?.getMonth() ?? 0);

  const years = useMemo(() => {
    const list: number[] = [];
    for (let y = maxYear; y >= minYear; y--) list.push(y);
    return list;
  }, [minYear, maxYear]);

  const openCalendar = () => {
    const y = clampViewYear(value?.getFullYear() ?? today.getFullYear() - 25, minYear, maxYear);
    setViewYear(y);
    setViewMonth(value?.getMonth() ?? 0);
    setPickerMode("day");
    setOpen(true);
  };

  const isBeforeMin = (d: Date) => minBound ? startOfDay(d) < minBound : false;
  const isAfterMax = (d: Date) => maxBound ? startOfDay(d) > maxBound : false;
  const isOutOfRange = (d: Date) => isBeforeMin(d) || isAfterMax(d);

  const monthDisabled = (monthIndex: number) => {
    const first = new Date(viewYear, monthIndex, 1);
    const last = new Date(viewYear, monthIndex + 1, 0);
    if (isAfterMax(first) && isAfterMax(last)) return true;
    if (isBeforeMin(first) && isBeforeMin(last)) return true;
    return false;
  };

  const prevMonth = () => {
    if (viewMonth === 0) {
      const y = viewYear - 1;
      if (y >= minYear) { setViewMonth(11); setViewYear(y); }
    } else setViewMonth(m => m - 1);
  };

  const nextMonth = () => {
    if (viewMonth === 11) {
      const y = viewYear + 1;
      if (y <= maxYear) { setViewMonth(0); setViewYear(y); }
    } else setViewMonth(m => m + 1);
  };

  const selectMonth = (monthIndex: number) => {
    if (monthDisabled(monthIndex)) return;
    setViewMonth(monthIndex);
    setPickerMode("day");
  };

  const selectYear = (year: number) => {
    setViewYear(year);
    setPickerMode("month");
  };

  const selectDay = (day: number) => {
    const d = new Date(viewYear, viewMonth, day);
    if (isOutOfRange(d)) return;
    onChange(d);
    setOpen(false);
  };

  const isDisabled = (day: number) => isOutOfRange(new Date(viewYear, viewMonth, day));

  const isSelected = (day: number) => {
    if (!value) return false;
    return value.getFullYear() === viewYear && value.getMonth() === viewMonth && value.getDate() === day;
  };

  const getDaysInMonth = (y: number, m: number) => new Date(y, m + 1, 0).getDate();
  const getFirstDayOfWeek = (y: number, m: number) => new Date(y, m, 1).getDay();

  const daysInMonth = getDaysInMonth(viewYear, viewMonth);
  const firstDay = getFirstDayOfWeek(viewYear, viewMonth);
  const cells: (number | null)[] = [
    ...Array(firstDay).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const canPrevMonth = viewYear > minYear || viewMonth > 0;
  const canNextMonth = viewYear < maxYear || viewMonth < 11;

  return (
    <View style={{ marginBottom: 16 }}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <TouchableOpacity
        testID={testID}
        style={styles.trigger}
        onPress={openCalendar}
        activeOpacity={0.8}
      >
        <Text style={[styles.triggerText, !value && styles.triggerPlaceholder]}>
          📅 {formatDate(value)}
        </Text>
      </TouchableOpacity>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={() => setOpen(false)}>
          <TouchableOpacity activeOpacity={1} onPress={e => e.stopPropagation()}>
            <View style={styles.calendar}>
              {/* Month / year selectors */}
              <View style={styles.calNav}>
                {pickerMode === "day" ? (
                  <TouchableOpacity
                    onPress={prevMonth}
                    style={[styles.navBtn, !canPrevMonth && styles.navBtnDisabled]}
                    disabled={!canPrevMonth}
                  >
                    <Text style={styles.navArrow}>‹</Text>
                  </TouchableOpacity>
                ) : (
                  <View style={styles.navBtn} />
                )}

                <View style={styles.selectorRow}>
                  <TouchableOpacity
                    style={[styles.selectorChip, pickerMode === "month" && styles.selectorChipActive]}
                    onPress={() => setPickerMode(m => m === "month" ? "day" : "month")}
                  >
                    <Text style={[styles.selectorText, pickerMode === "month" && styles.selectorTextActive]}>
                      {MONTHS_FR[viewMonth]}
                    </Text>
                    <Text style={styles.selectorCaret}>▾</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.selectorChip, pickerMode === "year" && styles.selectorChipActive]}
                    onPress={() => setPickerMode(m => m === "year" ? "day" : "year")}
                  >
                    <Text style={[styles.selectorText, pickerMode === "year" && styles.selectorTextActive]}>
                      {viewYear}
                    </Text>
                    <Text style={styles.selectorCaret}>▾</Text>
                  </TouchableOpacity>
                </View>

                {pickerMode === "day" ? (
                  <TouchableOpacity
                    onPress={nextMonth}
                    style={[styles.navBtn, !canNextMonth && styles.navBtnDisabled]}
                    disabled={!canNextMonth}
                  >
                    <Text style={styles.navArrow}>›</Text>
                  </TouchableOpacity>
                ) : (
                  <View style={styles.navBtn} />
                )}
              </View>

              {pickerMode === "month" && (
                <View style={styles.monthGrid}>
                  {MONTHS_FR.map((name, i) => (
                    <TouchableOpacity
                      key={name}
                      style={[
                        styles.monthCell,
                        viewMonth === i && styles.monthCellActive,
                        monthDisabled(i) && styles.monthCellDisabled,
                      ]}
                      onPress={() => selectMonth(i)}
                      disabled={monthDisabled(i)}
                    >
                      <Text style={[
                        styles.monthCellText,
                        viewMonth === i && styles.monthCellTextActive,
                        monthDisabled(i) && styles.monthCellTextDisabled,
                      ]}>
                        {MONTHS_SHORT[i]}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              {pickerMode === "year" && (
                <ScrollView style={styles.yearScroll} showsVerticalScrollIndicator>
                  <View style={styles.yearGrid}>
                    {years.map(y => (
                      <TouchableOpacity
                        key={y}
                        style={[styles.yearCell, viewYear === y && styles.yearCellActive]}
                        onPress={() => selectYear(y)}
                      >
                        <Text style={[styles.yearCellText, viewYear === y && styles.yearCellTextActive]}>
                          {y}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </ScrollView>
              )}

              {pickerMode === "day" && (
                <>
                  <View style={styles.weekRow}>
                    {["Di", "Lu", "Ma", "Me", "Je", "Ve", "Sa"].map(d => (
                      <Text key={d} style={styles.weekDay}>{d}</Text>
                    ))}
                  </View>
                  <View style={styles.grid}>
                    {cells.map((day, i) => (
                      <TouchableOpacity
                        key={i}
                        style={[
                          styles.cell,
                          day && isSelected(day) ? styles.cellSelected : null,
                        ]}
                        onPress={() => day && !isDisabled(day) && selectDay(day)}
                        disabled={!day || isDisabled(day)}
                      >
                        <Text style={[
                          styles.cellText,
                          day && isSelected(day) ? styles.cellTextSelected : null,
                          day && isDisabled(day) ? styles.cellTextDisabled : null,
                        ]}>
                          {day ?? ""}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </>
              )}

              <TouchableOpacity style={styles.closeCalBtn} onPress={() => setOpen(false)}>
                <Text style={styles.closeCalTxt}>Fermer</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const CELL_SIZE = 38;

const styles = StyleSheet.create({
  label: { color: Colors.text, fontWeight: "700", fontSize: 13, marginBottom: 6 },
  trigger: {
    borderWidth: 1.5, borderColor: (Colors as any).border ?? "#D1D5DB",
    borderRadius: (Radius as any).lg ?? 12, paddingVertical: 13, paddingHorizontal: 16,
    backgroundColor: (Colors as any).surface ?? "#F8FAFC",
  },
  triggerText: { color: Colors.text, fontSize: 15, fontWeight: "600" },
  triggerPlaceholder: { color: (Colors as any).textMuted ?? "#94A3B8" },
  overlay: {
    flex: 1, backgroundColor: "rgba(0,0,0,0.45)",
    alignItems: "center", justifyContent: "center",
  },
  calendar: {
    backgroundColor: (Colors as any).bg ?? "#fff",
    borderRadius: 20, padding: 20, width: 320,
    shadowColor: "#000", shadowOpacity: 0.15, shadowRadius: 20, shadowOffset: { width: 0, height: 8 },
    elevation: 10,
  },
  calNav: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 14 },
  navBtn: { width: 36, alignItems: "center", padding: 8 },
  navBtnDisabled: { opacity: 0.3 },
  navArrow: { color: Colors.primary ?? "#1E3A5F", fontSize: 22, fontWeight: "700" },
  selectorRow: { flex: 1, flexDirection: "row", justifyContent: "center", gap: 8 },
  selectorChip: {
    flexDirection: "row", alignItems: "center", gap: 4,
    paddingHorizontal: 12, paddingVertical: 8,
    borderRadius: Radius.lg ?? 12,
    borderWidth: 1.5, borderColor: (Colors as any).border ?? "#D1D5DB",
    backgroundColor: (Colors as any).surface ?? "#F8FAFC",
  },
  selectorChipActive: {
    borderColor: Colors.secondary ?? "#10B981",
    backgroundColor: (Colors.secondary ?? "#10B981") + "15",
  },
  selectorText: { color: Colors.primary ?? "#1E3A5F", fontSize: 14, fontWeight: "800" },
  selectorTextActive: { color: Colors.secondary ?? "#10B981" },
  selectorCaret: { color: (Colors as any).textMuted ?? "#94A3B8", fontSize: 10, fontWeight: "700" },
  monthGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 8 },
  monthCell: {
    width: "30%", paddingVertical: 12, alignItems: "center",
    borderRadius: Radius.lg ?? 12, borderWidth: 1, borderColor: (Colors as any).border ?? "#E2E8F0",
  },
  monthCellActive: { backgroundColor: Colors.primary ?? "#1E3A5F", borderColor: Colors.primary ?? "#1E3A5F" },
  monthCellDisabled: { opacity: 0.35 },
  monthCellText: { color: Colors.text ?? "#111827", fontSize: 13, fontWeight: "700" },
  monthCellTextActive: { color: "#fff" },
  monthCellTextDisabled: { color: (Colors as any).textMuted ?? "#CBD5E1" },
  yearScroll: { maxHeight: 220, marginBottom: 8 },
  yearGrid: { flexDirection: "row", flexWrap: "wrap", gap: 6, justifyContent: "center" },
  yearCell: {
    width: 68, paddingVertical: 10, alignItems: "center",
    borderRadius: Radius.lg ?? 12, borderWidth: 1, borderColor: (Colors as any).border ?? "#E2E8F0",
  },
  yearCellActive: { backgroundColor: Colors.primary ?? "#1E3A5F", borderColor: Colors.primary ?? "#1E3A5F" },
  yearCellText: { color: Colors.text ?? "#111827", fontSize: 13, fontWeight: "700" },
  yearCellTextActive: { color: "#fff" },
  weekRow: { flexDirection: "row", marginBottom: 4 },
  weekDay: { width: CELL_SIZE, textAlign: "center", color: (Colors as any).textMuted ?? "#94A3B8", fontSize: 11, fontWeight: "700" },
  grid: { flexDirection: "row", flexWrap: "wrap" },
  cell: { width: CELL_SIZE, height: CELL_SIZE, alignItems: "center", justifyContent: "center", borderRadius: 19 },
  cellSelected: { backgroundColor: Colors.primary ?? "#1E3A5F" },
  cellText: { color: Colors.text ?? "#111827", fontSize: 13, fontWeight: "600" },
  cellTextSelected: { color: "#fff" },
  cellTextDisabled: { color: (Colors as any).textMuted ?? "#CBD5E1" },
  closeCalBtn: { marginTop: 12, alignItems: "center", padding: 10 },
  closeCalTxt: { color: (Colors as any).textMuted ?? "#64748B", fontSize: 13, fontWeight: "700" },
});
