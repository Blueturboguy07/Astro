import { Popover, PopoverButton, PopoverPanel, Switch } from '@headlessui/react'
import {
  CaretDownIcon,
  GlobeIcon,
  GraduationCapIcon,
  NetworkIcon,
} from '@phosphor-icons/react'
import { AnimatePresence, motion } from 'motion/react'
import { useChat } from '@/lib/simplicity/hooks/useChat'

const sourcesList = [
  {
    name: 'Web',
    key: 'web',
    icon: <GlobeIcon className="h-[16px] w-auto" />,
  },
  {
    name: 'Academic',
    key: 'academic',
    icon: <GraduationCapIcon className="h-[16px] w-auto" />,
  },
  {
    name: 'Social',
    key: 'discussions',
    icon: <NetworkIcon className="h-[16px] w-auto" />,
  },
]

const Sources = () => {
  const { sources, setSources } = useChat()

  return (
    <Popover className="relative">
      {({ open }) => (
        <>
          {/* Labelled for the same reason as the model button — and the label
              doubles as the current state, so which sources are in play is
              visible without opening anything. */}
          <PopoverButton className="flex flex-row items-center gap-1.5 rounded-lg px-2 py-1.5 text-black/50 transition duration-200 hover:bg-light-200 hover:text-black focus:outline-none active:scale-95 active:border-none dark:text-white/50 hover:dark:bg-dark-200 dark:hover:text-white">
            <GlobeIcon className="h-[16px] w-auto shrink-0" />
            <span className="max-w-[110px] truncate font-medium text-xs">
              {sources.length === 0
                ? 'Sources'
                : sources.length === sourcesList.length
                  ? 'All sources'
                  : sourcesList
                      .filter((s) => sources.includes(s.key))
                      .map((s) => s.name)
                      .join(', ')}
            </span>
            <CaretDownIcon className="h-[12px] w-auto shrink-0 opacity-60" />
          </PopoverButton>
          <AnimatePresence>
            {open && (
              <PopoverPanel
                static
                className="absolute right-0 z-10 w-64 md:w-[225px]"
              >
                <motion.div
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  transition={{ duration: 0.1, ease: 'easeOut' }}
                  className="flex max-h-[200px] w-full origin-top-right flex-col overflow-y-auto rounded-lg border border-light-200 bg-light-primary p-1 shadow-lg md:max-h-none dark:border-dark-200 dark:bg-dark-primary"
                >
                  {sourcesList.map((source, i) => (
                    <div
                      key={i}
                      className="flex cursor-pointer flex-row justify-between rounded-md px-2 py-3 hover:bg-light-100 hover:dark:bg-dark-100"
                      onClick={() => {
                        if (!sources.includes(source.key)) {
                          setSources([...sources, source.key])
                        } else {
                          setSources(sources.filter((s) => s !== source.key))
                        }
                      }}
                    >
                      <div className="flex flex-row space-x-1.5 text-black/80 dark:text-white/80">
                        {source.icon}
                        <p className="text-xs">{source.name}</p>
                      </div>
                      <Switch
                        checked={sources.includes(source.key)}
                        className="group relative flex h-4 w-7 shrink-0 cursor-pointer rounded-full bg-light-200 p-0.5 transition-colors duration-200 ease-in-out focus:outline-none disabled:cursor-not-allowed disabled:opacity-60 data-[checked]:bg-sky-500 dark:bg-white/10 dark:data-[checked]:bg-sky-500"
                      >
                        <span
                          aria-hidden="true"
                          className="pointer-events-none inline-block size-3 translate-x-[1px] rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out group-data-[checked]:translate-x-3"
                        />
                      </Switch>
                    </div>
                  ))}
                </motion.div>
              </PopoverPanel>
            )}
          </AnimatePresence>
        </>
      )}
    </Popover>
  )
}

export default Sources
