// Reusable selector components for profile form
import { useState } from "react";
import {
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { ChevronDown, Search, X, Calendar, Check } from "lucide-react-native";
import { Colors, Radius, Spacing } from "@/src/theme";
import type { GeoEntry } from "@/src/profile-geo-data";

// ── Generic picker modal ──────────────────────────────────────

interface PickerProps {
  label: string;
  value: string;
  options: GeoEntry[];
  onSelect: (value: string, label: string) => void;
  disabled?: boolean;
  placeholder?: string;
  testID?: string;
}

export function SelectPicker({ label, value, options, onSelect, disabled, placeholder, testID }: PickerProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const display = options.find((o) => o.value === value)?.label ?? value ?? "";
  const filtered = options.filter((o) =>
    o.label.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <View style={styles.fieldWrap}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TouchableOpacity
        testID={testID}
        disabled={disabled}
        onPress={() => { setSearch(""); setOpen(true); }}
        style={[styles.selector, disabled && styles.selectorDisabled]}
        activeOpacity={0.7}
      >
        <Text style={[styles.selectorText, !display && styles.placeholder]}>
          {display || placeholder || `Sélectionner ${label.toLowerCase()}`}
        </Text>
        <ChevronDown color={disabled ? Colors.textSubtle : Colors.secondary} size={16} />
      </TouchableOpacity>

      <Modal visible={open} transparent animationType="slide" statusBarTranslucent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            {/* Header */}
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{label}</Text>
              <TouchableOpacity onPress={() => setOpen(false)} style={styles.closeBtn}>
                <X color={Colors.textMuted} size={20} />
              </TouchableOpacity>
            </View>

            {/* Search */}
            <View style={styles.searchRow}>
              <Search color={Colors.textMuted} size={16} />
              <TextInput
                style={styles.searchInput}
                placeholder="Rechercher..."
                placeholderTextColor={Colors.textSubtle}
                value={search}
                onChangeText={setSearch}
                autoFocus
              />
            </View>

            {/* List */}
            <ScrollView keyboardShouldPersistTaps="handled" style={{ flex: 1 }}>
              {filtered.map((opt) => (
                <TouchableOpacity
                  key={opt.value}
                  style={[styles.optionRow, opt.value === value && styles.optionSelected]}
                  onPress={() => { onSelect(opt.value, opt.label); setOpen(false); }}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.optionText, opt.value === value && styles.optionTextSelected]}>
                    {opt.label}
                  </Text>
                  {opt.value === value ? <Check color={Colors.primary} size={16} /> : null}
                </TouchableOpacity>
              ))}
              {filtered.length === 0 ? (
                <Text style={styles.noResult}>Aucun résultat</Text>
              ) : null}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ── Chip selector (for titles like Dr, Pr, Ing...) ────────────

interface ChipSelectorProps {
  label: string;
  options: string[];
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}

export function ChipSelector({ label, options, value, onChange, disabled }: ChipSelectorProps) {
  return (
    <View style={styles.fieldWrap}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
        {options.map((opt) => (
          <TouchableOpacity
            key={opt}
            disabled={disabled}
            onPress={() => onChange(value === opt ? "" : opt)}
            style={[
              styles.chip,
              value === opt && styles.chipActive,
              disabled && styles.chipDisabled,
            ]}
            activeOpacity={0.7}
          >
            <Text style={[styles.chipText, value === opt && styles.chipTextActive]}>{opt}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}

// ── Date picker (cross-platform) ─────────────────────────────

interface DatePickerProps {
  label: string;
  value: string; // ISO date string YYYY-MM-DD
  onChange: (iso: string) => void;
  disabled?: boolean;
  testID?: string;
}

export function DatePicker({ label, value, onChange, disabled, testID }: DatePickerProps) {
  const [open, setOpen] = useState(false);

  // Parse current value
  const parsed = value ? new Date(value) : null;
  const [year, setYear] = useState(parsed?.getFullYear() ?? 1990);
  const [month, setMonth] = useState((parsed?.getMonth() ?? 0) + 1);
  const [day, setDay] = useState(parsed?.getDate() ?? 1);

  const MONTHS = [
    "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
    "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre",
  ];

  const daysInMonth = new Date(year, month, 0).getDate();
  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: currentYear - 1920 }, (_, i) => currentYear - 16 - i);

  const displayDate = parsed
    ? `${String(parsed.getDate()).padStart(2, "0")}/${String(parsed.getMonth() + 1).padStart(2, "0")}/${parsed.getFullYear()}`
    : "";

  const confirm = () => {
    const d = Math.min(day, daysInMonth);
    const iso = `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    onChange(iso);
    setOpen(false);
  };

  return (
    <View style={styles.fieldWrap}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TouchableOpacity
        testID={testID}
        disabled={disabled}
        onPress={() => {
          if (parsed) {
            setYear(parsed.getFullYear());
            setMonth(parsed.getMonth() + 1);
            setDay(parsed.getDate());
          }
          setOpen(true);
        }}
        style={[styles.selector, disabled && styles.selectorDisabled]}
        activeOpacity={0.7}
      >
        <Text style={[styles.selectorText, !displayDate && styles.placeholder]}>
          {displayDate || "JJ/MM/AAAA"}
        </Text>
        <Calendar color={disabled ? Colors.textSubtle : Colors.secondary} size={16} />
      </TouchableOpacity>

      <Modal visible={open} transparent animationType="slide" statusBarTranslucent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalSheet, { maxHeight: 480 }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{label}</Text>
              <TouchableOpacity onPress={() => setOpen(false)} style={styles.closeBtn}>
                <X color={Colors.textMuted} size={20} />
              </TouchableOpacity>
            </View>

            {/* Date display */}
            <View style={styles.dateDisplay}>
              <Text style={styles.dateDisplayText}>
                {String(Math.min(day, daysInMonth)).padStart(2, "0")} {MONTHS[month - 1]} {year}
              </Text>
            </View>

            {/* 3-column scroll pickers */}
            <View style={styles.dateColumns}>
              {/* Day */}
              <View style={styles.dateCol}>
                <Text style={styles.dateColLabel}>Jour</Text>
                <ScrollView style={styles.dateScroll} showsVerticalScrollIndicator={false}>
                  {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((d) => (
                    <TouchableOpacity
                      key={d}
                      onPress={() => setDay(d)}
                      style={[styles.datePick, d === day && styles.datePickActive]}
                    >
                      <Text style={[styles.datePickText, d === day && styles.datePickTextActive]}>
                        {String(d).padStart(2, "0")}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>

              {/* Month */}
              <View style={[styles.dateCol, { flex: 2 }]}>
                <Text style={styles.dateColLabel}>Mois</Text>
                <ScrollView style={styles.dateScroll} showsVerticalScrollIndicator={false}>
                  {MONTHS.map((m, i) => (
                    <TouchableOpacity
                      key={m}
                      onPress={() => setMonth(i + 1)}
                      style={[styles.datePick, i + 1 === month && styles.datePickActive]}
                    >
                      <Text style={[styles.datePickText, i + 1 === month && styles.datePickTextActive]}>
                        {m}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>

              {/* Year */}
              <View style={styles.dateCol}>
                <Text style={styles.dateColLabel}>Année</Text>
                <ScrollView style={styles.dateScroll} showsVerticalScrollIndicator={false}>
                  {years.map((y) => (
                    <TouchableOpacity
                      key={y}
                      onPress={() => setYear(y)}
                      style={[styles.datePick, y === year && styles.datePickActive]}
                    >
                      <Text style={[styles.datePickText, y === year && styles.datePickTextActive]}>
                        {y}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            </View>

            <TouchableOpacity style={styles.confirmBtn} onPress={confirm}>
              <Text style={styles.confirmText}>Confirmer</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ── Name field with prefix ────────────────────────────────────

interface NameFieldProps {
  titleValue: string;
  onTitleChange: (v: string) => void;
  firstNameValue: string;
  onFirstNameChange: (v: string) => void;
  lastNameValue: string;
  onLastNameChange: (v: string) => void;
  disabled?: boolean;
  titles: string[];
}

export function NameField({
  titleValue, onTitleChange,
  firstNameValue, onFirstNameChange,
  lastNameValue, onLastNameChange,
  disabled, titles,
}: NameFieldProps) {
  return (
    <View style={styles.fieldWrap}>
      <Text style={styles.fieldLabel}>Identité</Text>
      {/* Title chips */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={[styles.chipRow, { marginBottom: 8 }]}>
        {titles.map((t) => (
          <TouchableOpacity
            key={t}
            disabled={disabled}
            onPress={() => onTitleChange(titleValue === t ? "" : t)}
            style={[styles.chip, titleValue === t && styles.chipActive, disabled && styles.chipDisabled]}
            activeOpacity={0.7}
          >
            <Text style={[styles.chipText, titleValue === t && styles.chipTextActive]}>{t}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
      {/* First name + Last name */}
      <View style={styles.nameRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.subLabel}>Prénom(s)</Text>
          <TextInput
            style={[styles.nameInput, disabled && styles.inputDisabled]}
            value={firstNameValue}
            onChangeText={onFirstNameChange}
            editable={!disabled}
            placeholder="Prénom(s)"
            placeholderTextColor={Colors.textSubtle}
          />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.subLabel}>Nom de famille</Text>
          <TextInput
            style={[styles.nameInput, disabled && styles.inputDisabled]}
            value={lastNameValue}
            onChangeText={onLastNameChange}
            editable={!disabled}
            placeholder="Nom"
            placeholderTextColor={Colors.textSubtle}
            autoCapitalize="characters"
          />
        </View>
      </View>
    </View>
  );
}

// ── Text field with manual override (for "Autres") ───────────

interface ManualFieldProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  placeholder?: string;
}

export function ManualField({ label, value, onChange, disabled, placeholder }: ManualFieldProps) {
  return (
    <View style={styles.fieldWrap}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        style={[styles.manualInput, disabled && styles.inputDisabled]}
        value={value}
        onChangeText={onChange}
        editable={!disabled}
        placeholder={placeholder ?? `Saisir ${label.toLowerCase()}...`}
        placeholderTextColor={Colors.textSubtle}
      />
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────

const styles = StyleSheet.create({
  fieldWrap: { marginBottom: 14 },
  fieldLabel: { color: Colors.textMuted, fontSize: 12, fontWeight: "700", letterSpacing: 0.4, marginBottom: 6, textTransform: "uppercase" },
  subLabel: { color: Colors.textSubtle, fontSize: 11, fontWeight: "600", marginBottom: 4 },

  selector: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    backgroundColor: Colors.surfaceAlt, borderRadius: Radius.md, paddingHorizontal: 14,
    paddingVertical: 13, borderWidth: 1, borderColor: Colors.border,
  },
  selectorDisabled: { opacity: 0.55, backgroundColor: Colors.borderLight },
  selectorText: { color: Colors.text, fontSize: 14, fontWeight: "600", flex: 1 },
  placeholder: { color: Colors.textSubtle },

  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  modalSheet: {
    backgroundColor: Colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    maxHeight: "75%", paddingBottom: 32,
  },
  modalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 20, borderBottomWidth: 1, borderBottomColor: Colors.border },
  modalTitle: { color: Colors.text, fontSize: 16, fontWeight: "900" },
  closeBtn: { padding: 4 },
  searchRow: { flexDirection: "row", alignItems: "center", gap: 10, margin: 12, paddingHorizontal: 14, paddingVertical: 10, backgroundColor: Colors.surfaceAlt, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border },
  searchInput: { flex: 1, color: Colors.text, fontSize: 14, fontWeight: "500" },
  optionRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: Colors.borderLight },
  optionSelected: { backgroundColor: Colors.primaryLight },
  optionText: { color: Colors.text, fontSize: 14, fontWeight: "600" },
  optionTextSelected: { color: Colors.primary, fontWeight: "800" },
  noResult: { textAlign: "center", color: Colors.textMuted, fontSize: 13, padding: 24 },

  chipRow: { flexDirection: "row", gap: 8, paddingVertical: 2 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: Radius.full, borderWidth: 1.5, borderColor: Colors.border, backgroundColor: Colors.surface },
  chipActive: { backgroundColor: Colors.secondary, borderColor: Colors.secondary },
  chipDisabled: { opacity: 0.5 },
  chipText: { color: Colors.text, fontWeight: "700", fontSize: 13 },
  chipTextActive: { color: "#fff" },

  dateDisplay: { alignItems: "center", paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: Colors.border },
  dateDisplayText: { color: Colors.primary, fontSize: 20, fontWeight: "900" },
  dateColumns: { flexDirection: "row", height: 200, paddingHorizontal: 8 },
  dateCol: { flex: 1, alignItems: "center" },
  dateColLabel: { color: Colors.textMuted, fontSize: 11, fontWeight: "700", paddingVertical: 8, textTransform: "uppercase" },
  dateScroll: { width: "100%" },
  datePick: { alignItems: "center", paddingVertical: 10, borderRadius: 8 },
  datePickActive: { backgroundColor: Colors.primaryLight },
  datePickText: { color: Colors.textMuted, fontSize: 14, fontWeight: "600" },
  datePickTextActive: { color: Colors.primary, fontWeight: "900" },
  confirmBtn: { backgroundColor: Colors.primary, borderRadius: 14, margin: 16, paddingVertical: 14, alignItems: "center" },
  confirmText: { color: "#fff", fontWeight: "800", fontSize: 15 },

  nameRow: { flexDirection: "row", gap: 10 },
  nameInput: {
    backgroundColor: Colors.surfaceAlt, borderRadius: Radius.md, paddingHorizontal: 12,
    paddingVertical: 12, borderWidth: 1, borderColor: Colors.border, color: Colors.text, fontSize: 14, fontWeight: "600",
  },
  manualInput: {
    backgroundColor: Colors.surfaceAlt, borderRadius: Radius.md, paddingHorizontal: 14,
    paddingVertical: 13, borderWidth: 1.5, borderColor: Colors.secondary + "60", color: Colors.text, fontSize: 14, fontWeight: "600",
  },
  inputDisabled: { opacity: 0.55, backgroundColor: Colors.borderLight },
});
