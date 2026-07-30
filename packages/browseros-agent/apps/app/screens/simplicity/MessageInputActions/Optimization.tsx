import { Popover, PopoverButton, PopoverPanel } from '@headlessui/react'
import { ChevronDown, Sliders, Star, Zap } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useChat } from '@/lib/simplicity/hooks/useChat'
import { cn } from '@/lib/simplicity/utils'

const OptimizationModes = [
  {
    key: 'speed',
    title: 'Speed',
    description: 'Prioritize speed and get the quickest possible answer.',
    icon: <Zap size={16} className="text-[#FF9800]" />,
  },
  {
    key: 'balanced',
    title: 'Balanced',
    description: 'Find the right balance between speed and accuracy',
    icon: <Sliders size={16} className="text-[#4CAF50]" />,
  },
  {
    key: 'quality',
    title: 'Quality',
    description: 'Get the most thorough and accurate answer',
    icon: (
      <Star
        size={16}
        className="fill-[#BBDEFB] text-[#2196F3] dark:fill-[#2196F3] dark:text-[#BBDEFB]"
      />
    ),
  },
]

const Optimization = () => {
  const { optimizationMode, setOptimizationMode } = useChat()

  return (
    <Popover className="relative w-full max-w-[15rem] md:max-w-md lg:max-w-lg">
      {({ open }) => (
        <>
          <PopoverButton
            type="button"
            className="rounded-xl p-2 text-black/50 transition duration-200 hover:bg-light-secondary hover:text-black focus:outline-none active:scale-95 dark:text-white/50 dark:hover:bg-dark-secondary dark:hover:text-white"
          >
            <div className="flex flex-row items-center space-x-1">
              {
                OptimizationModes.find((mode) => mode.key === optimizationMode)
                  ?.icon
              }
              <ChevronDown
                size={16}
                className={cn(
                  open ? 'rotate-180' : 'rotate-0',
                  'duration:200 transition',
                )}
              />
            </div>
          </PopoverButton>
          <AnimatePresence>
            {open && (
              <PopoverPanel
                className="absolute left-0 z-10 w-64 md:w-[250px]"
                static
              >
                <motion.div
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  transition={{ duration: 0.1, ease: 'easeOut' }}
                  className="flex max-h-[200px] w-full origin-top-left flex-col space-y-2 overflow-y-auto rounded-lg border border-light-200 bg-light-primary p-2 md:max-h-none dark:border-dark-200 dark:bg-dark-primary"
                >
                  {OptimizationModes.map((mode, i) => (
                    <PopoverButton
                      onClick={() => setOptimizationMode(mode.key)}
                      key={i}
                      className={cn(
                        'flex cursor-pointer flex-col items-start justify-start space-y-1 rounded-lg p-2 text-start transition duration-200 focus:outline-none',
                        optimizationMode === mode.key
                          ? 'bg-light-secondary dark:bg-dark-secondary'
                          : 'hover:bg-light-secondary dark:hover:bg-dark-secondary',
                      )}
                    >
                      <div className="flex w-full flex-row justify-between text-black dark:text-white">
                        <div className="flex flex-row space-x-1">
                          {mode.icon}
                          <p className="font-medium text-xs">{mode.title}</p>
                        </div>
                        {mode.key === 'quality' && (
                          <span className="rounded-full border border-sky-600 bg-sky-500/70 px-1 text-[10px] text-white dark:bg-sky-500/40">
                            Beta
                          </span>
                        )}
                      </div>
                      <p className="text-black/70 text-xs dark:text-white/70">
                        {mode.description}
                      </p>
                    </PopoverButton>
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

export default Optimization
