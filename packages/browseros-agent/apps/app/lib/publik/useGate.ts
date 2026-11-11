import { useEffect, useState } from 'react'
import {
  RuntimeMessageType,
  sendRuntimeMessage,
} from '@/lib/messaging/runtime/runtimeMessages'
import {
  accountStorage,
  type Choice,
  choiceStorage,
  clear402,
  type GateAction,
  type GateState,
  gateStorage,
  moneyStorage,
  type PublikAccount,
  setChoice,
  telemetryConsentStorage,
} from './publik'

/* What a page reads of publik: the gate screen of this session, the
   account summary, the stored choice. Never the key. */

type Item<T> = {
  getValue(): Promise<T>
  watch(cb: (value: T) => void): () => void
}

function useStorageItem<T>(item: Item<T>): T | undefined {
  const [value, setValue] = useState<T | undefined>(undefined)
  useEffect(() => {
    let live = true
    item
      .getValue()
      .then((v) => {
        if (live) setValue(v)
      })
      .catch(() => null)
    const unwatch = item.watch((v) => {
      if (live) setValue(v)
    })
    return () => {
      live = false
      unwatch()
    }
  }, [item])
  return value
}

/** undefined while loading; null before the worker has written anything this session. */
export function useGateState(): GateState | null | undefined {
  const state = useStorageItem(gateStorage)
  useEffect(() => {
    /* A page can open before the worker ran, or after it stopped: wake it. */
    sendRuntimeMessage(RuntimeMessageType.publikWake, undefined).catch(
      () => null,
    )
  }, [])
  return state
}

export const pressGate = (action: GateAction) =>
  sendRuntimeMessage(RuntimeMessageType.publikGate, { action }).catch(
    () => null,
  )

export type UsePublikAccount = {
  account: PublikAccount | null | undefined
  choice: Choice | null | undefined
  usageCounted: boolean
  choose: (choice: Choice | null) => Promise<void>
  setUsageCounted: (on: boolean) => Promise<void>
}

export function usePublikAccount(): UsePublikAccount {
  const account = useStorageItem(accountStorage)
  const choice = useStorageItem(choiceStorage)
  const consent = useStorageItem(telemetryConsentStorage)
  return {
    account,
    choice,
    usageCounted: consent?.usage !== false,
    choose: async (next) => {
      await setChoice(next)
      /* The background applies the choice on its own watch; this asks it to
         retry when the local server was still starting. */
      sendRuntimeMessage(RuntimeMessageType.publikSync, undefined).catch(
        () => null,
      )
    },
    setUsageCounted: (on) => telemetryConsentStorage.setValue({ usage: on }),
  }
}

/** The last 402 the chat saw, with its one link; `dismiss` clears it. */
export function usePublikMoney() {
  const money = useStorageItem(moneyStorage)
  return { money: money ?? null, dismiss: clear402 }
}
