import { Switch } from '@headlessui/react'
import { Loader2 } from 'lucide-react'
import { useTheme } from 'next-themes'
import { useState } from 'react'
import { toast } from 'sonner'
import type {
  SelectUIConfigField,
  StringUIConfigField,
  SwitchUIConfigField,
  TextareaUIConfigField,
  UIConfigField,
} from '@/lib/simplicity/config/types'
import Select from '../ui/Select'
import { apiFetch } from '@/lib/simplicity/api-fetch'

const emitClientConfigChanged = () => {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event('client-config-changed'))
  }
}

const SettingsSelect = ({
  field,
  value,
  setValue,
  dataAdd,
}: {
  field: SelectUIConfigField
  value?: any
  setValue: (value: any) => void
  dataAdd: string
}) => {
  const [loading, setLoading] = useState(false)
  const { setTheme } = useTheme()

  const handleSave = async (newValue: any) => {
    setLoading(true)
    setValue(newValue)
    try {
      if (field.scope === 'client') {
        localStorage.setItem(field.key, newValue)
        if (field.key === 'theme') {
          setTheme(newValue)
        }
        emitClientConfigChanged()
      } else {
        const res = await apiFetch('/api/config', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            key: `${dataAdd}.${field.key}`,
            value: newValue,
          }),
        })

        if (!res.ok) {
          throw new Error('Failed to save configuration')
        }
      }
    } catch (_error) {
      toast.error('Failed to save configuration.')
    } finally {
      setTimeout(() => setLoading(false), 150)
    }
  }

  return (
    <section className="rounded-xl border border-light-200 bg-light-primary/80 p-4 transition-colors lg:p-6 dark:border-dark-200 dark:bg-dark-primary/80">
      <div className="space-y-3 lg:space-y-5">
        <div>
          <h4 className="text-black text-sm lg:text-sm dark:text-white">
            {field.name}
          </h4>
          <p className="text-[11px] text-black/50 lg:text-xs dark:text-white/50">
            {field.description}
          </p>
        </div>
        <Select
          value={value}
          onChange={(event) => handleSave(event.target.value)}
          options={field.options.map((option) => ({
            value: option.value,
            label: option.name,
          }))}
          className="!text-xs lg:!text-sm"
          loading={loading}
          disabled={loading}
        />
      </div>
    </section>
  )
}

const SettingsInput = ({
  field,
  value,
  setValue,
  dataAdd,
}: {
  field: StringUIConfigField
  value?: any
  setValue: (value: any) => void
  dataAdd: string
}) => {
  const [loading, setLoading] = useState(false)

  const handleSave = async (newValue: any) => {
    setLoading(true)
    setValue(newValue)
    try {
      if (field.scope === 'client') {
        localStorage.setItem(field.key, newValue)
        emitClientConfigChanged()
      } else {
        const res = await apiFetch('/api/config', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            key: `${dataAdd}.${field.key}`,
            value: newValue,
          }),
        })

        if (!res.ok) {
          throw new Error('Failed to save configuration')
        }
      }
    } catch (_error) {
      toast.error('Failed to save configuration.')
    } finally {
      setTimeout(() => setLoading(false), 150)
    }
  }

  return (
    <section className="rounded-xl border border-light-200 bg-light-primary/80 p-4 transition-colors lg:p-6 dark:border-dark-200 dark:bg-dark-primary/80">
      <div className="space-y-3 lg:space-y-5">
        <div>
          <h4 className="text-black text-sm lg:text-sm dark:text-white">
            {field.name}
          </h4>
          <p className="text-[11px] text-black/50 lg:text-xs dark:text-white/50">
            {field.description}
          </p>
        </div>
        <div className="relative">
          <input
            value={value ?? field.default ?? ''}
            onChange={(event) => setValue(event.target.value)}
            onBlur={(event) => handleSave(event.target.value)}
            className="!text-xs lg:!text-[13px] w-full rounded-lg border border-light-200 bg-light-primary px-3 py-2 pr-10 text-black/80 transition-colors placeholder:text-black/40 focus-visible:border-light-300 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60 lg:px-4 lg:py-3 dark:border-dark-200 dark:bg-dark-primary dark:text-white/80 dark:focus-visible:border-dark-300 dark:placeholder:text-white/40"
            placeholder={field.placeholder}
            type="text"
            disabled={loading}
          />
          {loading && (
            <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-black/40 dark:text-white/40">
              <Loader2 className="h-4 w-4 animate-spin" />
            </span>
          )}
        </div>
      </div>
    </section>
  )
}

const SettingsTextarea = ({
  field,
  value,
  setValue,
  dataAdd,
}: {
  field: TextareaUIConfigField
  value?: any
  setValue: (value: any) => void
  dataAdd: string
}) => {
  const [loading, setLoading] = useState(false)

  const handleSave = async (newValue: any) => {
    setLoading(true)
    setValue(newValue)
    try {
      if (field.scope === 'client') {
        localStorage.setItem(field.key, newValue)
        emitClientConfigChanged()
      } else {
        const res = await apiFetch('/api/config', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            key: `${dataAdd}.${field.key}`,
            value: newValue,
          }),
        })

        if (!res.ok) {
          throw new Error('Failed to save configuration')
        }
      }
    } catch (_error) {
      toast.error('Failed to save configuration.')
    } finally {
      setTimeout(() => setLoading(false), 150)
    }
  }

  return (
    <section className="rounded-xl border border-light-200 bg-light-primary/80 p-4 transition-colors lg:p-6 dark:border-dark-200 dark:bg-dark-primary/80">
      <div className="space-y-3 lg:space-y-5">
        <div>
          <h4 className="text-black text-sm lg:text-sm dark:text-white">
            {field.name}
          </h4>
          <p className="text-[11px] text-black/50 lg:text-xs dark:text-white/50">
            {field.description}
          </p>
        </div>
        <div className="relative">
          <textarea
            value={value ?? field.default ?? ''}
            onChange={(event) => setValue(event.target.value)}
            onBlur={(event) => handleSave(event.target.value)}
            className="!text-xs lg:!text-[13px] w-full rounded-lg border border-light-200 bg-light-primary px-3 py-2 pr-10 text-black/80 transition-colors placeholder:text-black/40 focus-visible:border-light-300 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60 lg:px-4 lg:py-3 dark:border-dark-200 dark:bg-dark-primary dark:text-white/80 dark:focus-visible:border-dark-300 dark:placeholder:text-white/40"
            placeholder={field.placeholder}
            rows={4}
            disabled={loading}
          />
          {loading && (
            <span className="pointer-events-none absolute right-3 translate-y-3 text-black/40 dark:text-white/40">
              <Loader2 className="h-4 w-4 animate-spin" />
            </span>
          )}
        </div>
      </div>
    </section>
  )
}

const SettingsSwitch = ({
  field,
  value,
  setValue,
  dataAdd,
}: {
  field: SwitchUIConfigField
  value?: any
  setValue: (value: any) => void
  dataAdd: string
}) => {
  const [loading, setLoading] = useState(false)

  const handleSave = async (newValue: boolean) => {
    setLoading(true)
    setValue(newValue)
    try {
      if (field.scope === 'client') {
        localStorage.setItem(field.key, String(newValue))
        emitClientConfigChanged()
      } else {
        const res = await apiFetch('/api/config', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            key: `${dataAdd}.${field.key}`,
            value: newValue,
          }),
        })

        if (!res.ok) {
          throw new Error('Failed to save configuration')
        }
      }
    } catch (_error) {
      toast.error('Failed to save configuration.')
    } finally {
      setTimeout(() => setLoading(false), 150)
    }
  }

  const isChecked = value === true || value === 'true'

  return (
    <section className="rounded-xl border border-light-200 bg-light-primary/80 p-4 transition-colors lg:p-6 dark:border-dark-200 dark:bg-dark-primary/80">
      <div className="flex w-full flex-row items-center justify-between space-x-3 lg:space-x-5">
        <div>
          <h4 className="text-black text-sm lg:text-sm dark:text-white">
            {field.name}
          </h4>
          <p className="text-[11px] text-black/50 lg:text-xs dark:text-white/50">
            {field.description}
          </p>
        </div>
        <Switch
          checked={isChecked}
          onChange={handleSave}
          disabled={loading}
          className="group relative flex h-6 w-12 shrink-0 cursor-pointer rounded-full bg-light-200 p-1 transition-colors duration-200 ease-in-out focus:outline-none disabled:cursor-not-allowed disabled:opacity-60 data-[checked]:bg-sky-500 dark:bg-white/10 dark:data-[checked]:bg-sky-500"
        >
          <span
            aria-hidden="true"
            className="pointer-events-none inline-block size-4 translate-x-0 rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out group-data-[checked]:translate-x-6"
          />
        </Switch>
      </div>
    </section>
  )
}

const SettingsField = ({
  field,
  value,
  dataAdd,
}: {
  field: UIConfigField
  value: any
  dataAdd: string
}) => {
  const [val, setVal] = useState(value)

  switch (field.type) {
    case 'select':
      return (
        <SettingsSelect
          field={field}
          value={val}
          setValue={setVal}
          dataAdd={dataAdd}
        />
      )
    case 'string':
      return (
        <SettingsInput
          field={field}
          value={val}
          setValue={setVal}
          dataAdd={dataAdd}
        />
      )
    case 'textarea':
      return (
        <SettingsTextarea
          field={field}
          value={val}
          setValue={setVal}
          dataAdd={dataAdd}
        />
      )
    case 'switch':
      return (
        <SettingsSwitch
          field={field}
          value={val}
          setValue={setVal}
          dataAdd={dataAdd}
        />
      )
    default:
      return <div>Unsupported field type: {field.type}</div>
  }
}

export default SettingsField
