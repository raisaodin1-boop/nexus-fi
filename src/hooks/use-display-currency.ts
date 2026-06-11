import { useCallback, useEffect, useState } from "react";
import { ALL_CURRENCIES, type Currency } from "@/src/exchange-rates";
import { storage } from "@/src/utils/storage";

const KEY = "wallet_display_currency";

export function useDisplayCurrency() {
  const [currency, setCurrencyState] = useState<Currency>("XAF");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    storage.getItem(KEY, "XAF").then((v) => {
      if (v && ALL_CURRENCIES.includes(v as Currency)) setCurrencyState(v as Currency);
      setReady(true);
    });
  }, []);

  const setCurrency = useCallback((c: Currency) => {
    setCurrencyState(c);
    void storage.setItem(KEY, c);
  }, []);

  return { currency, setCurrency, ready };
}
