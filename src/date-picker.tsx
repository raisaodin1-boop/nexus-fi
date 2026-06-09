/**
 * DatePicker — calendar-style date selection.
 * Uses @react-native-community/datetimepicker on native,
 * falls back to a simple month/year grid on web.
 */
import React, { useState } from "react";
import {
  Modal, Platform, StyleSheet, Text, TouchableOpacity, View,
} from "react-native";
import { Colors, Radius, Spacing } from "@/src/theme";

interface Props {
  label?: string;
  value: Date | null;
  onChange: (date: Date) => void;
  minimumDate?: Date;
  testID?: string;
}

const MONTHS_FR = [
  "Janvier","Février","Mars","Avril","Mai","Juin",
  "Juillet","Août","Septembre","Octobre","Novembre","Décembre"
];

function formatDate(d: Date | null): string {
  if (!d) return "Sélectionner une date";
  return `${d.getDate().toString().padStart(2,"0")} ${MONTHS_FR[d.getMonth()]} ${d.getFullYear()}`;
}

export function DatePicker({ label, value, onChange, minimumDate, testID }: Props) {
  const [open, setOpen] = useState(false);
  const [viewYear, setViewYear] = useState(() => value?.getFullYear() ?? new Date().getFullYear());
  const [viewMonth, setViewMonth] = useState(() => value?.getMonth() ?? new Date().getMonth());

  const today = new Date();
  const minDate = minimumDate ?? today;

  const getDaysInMonth = (y: number, m: number) => new Date(y, m + 1, 0).getDate();
  const getFirstDayOfWeek = (y: number, m: number) => new Date(y, m, 1).getDay(); // 0=Sun

  const prevMonth = () => {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1); }
    else setViewMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1); }
    else setViewMonth(m => m + 1);
  };

  const selectDay = (day: number) => {
    const d = new Date(viewYear, viewMonth, day);
    if (d < minDate && !(d.toDateString() === minDate.toDateString())) return;
    onChange(d);
    setOpen(false);
  };

  const isDisabled = (day: number) => {
    const d = new Date(viewYear, viewMonth, day);
    return d < new Date(minDate.getFullYear(), minDate.getMonth(), minDate.getDate());
  };

  const isSelected = (day: number) => {
    if (!value) return false;
    return value.getFullYear() === viewYear && value.getMonth() === viewMonth && value.getDate() === day;
  };

  const daysInMonth = getDaysInMonth(viewYear, viewMonth);
  const firstDay = getFirstDayOfWeek(viewYear, viewMonth);
  const cells: (number | null)[] = [...Array(firstDay).fill(null), ...Array.from({length: daysInMonth}, (_, i) => i + 1)];
  // pad to complete last row
  while (cells.length % 7 !== 0) cells.push(null);

  return (
    <View style={{ marginBottom: 16 }}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <TouchableOpacity
        testID={testID}
        style={styles.trigger}
        onPress={() => setOpen(true)}
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
              {/* Month navigation */}
              <View style={styles.calNav}>
                <TouchableOpacity onPress={prevMonth} style={styles.navBtn}>
                  <Text style={styles.navArrow}>‹</Text>
                </TouchableOpacity>
                <Text style={styles.calMonth}>{MONTHS_FR[viewMonth]} {viewYear}</Text>
                <TouchableOpacity onPress={nextMonth} style={styles.navBtn}>
                  <Text style={styles.navArrow}>›</Text>
                </TouchableOpacity>
              </View>

              {/* Day headers */}
              <View style={styles.weekRow}>
                {["Di","Lu","Ma","Me","Je","Ve","Sa"].map(d => (
                  <Text key={d} style={styles.weekDay}>{d}</Text>
                ))}
              </View>

              {/* Day grid */}
              <View style={styles.grid}>
                {cells.map((day, i) => (
                  <TouchableOpacity
                    key={i}
                    style={[
                      styles.cell,
                      day && isSelected(day) ? styles.cellSelected : null,
                      day && isDisabled(day) ? styles.cellDisabled : null,
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
  navBtn: { padding: 8 },
  navArrow: { color: Colors.primary ?? "#1E3A5F", fontSize: 22, fontWeight: "700" },
  calMonth: { color: Colors.primary ?? "#1E3A5F", fontSize: 15, fontWeight: "900" },
  weekRow: { flexDirection: "row", marginBottom: 4 },
  weekDay: { width: CELL_SIZE, textAlign: "center", color: (Colors as any).textMuted ?? "#94A3B8", fontSize: 11, fontWeight: "700" },
  grid: { flexDirection: "row", flexWrap: "wrap" },
  cell: { width: CELL_SIZE, height: CELL_SIZE, alignItems: "center", justifyContent: "center", borderRadius: 19 },
  cellSelected: { backgroundColor: Colors.primary ?? "#1E3A5F" },
  cellDisabled: {},
  cellText: { color: Colors.text ?? "#111827", fontSize: 13, fontWeight: "600" },
  cellTextSelected: { color: "#fff" },
  cellTextDisabled: { color: (Colors as any).textMuted ?? "#CBD5E1" },
  closeCalBtn: { marginTop: 12, alignItems: "center", padding: 10 },
  closeCalTxt: { color: (Colors as any).textMuted ?? "#64748B", fontSize: 13, fontWeight: "700" },
});
