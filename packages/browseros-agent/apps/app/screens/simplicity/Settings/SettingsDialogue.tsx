import { Dialog, DialogPanel } from '@headlessui/react'
import { motion } from 'motion/react'
import {
  ArrowLeft,
  BrainCog,
  ChevronLeft,
  ExternalLink,
  Search,
  Sliders,
  ToggleRight,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { cn } from '@/lib/simplicity/utils'
import Select from '@/screens/simplicity/ui/Select'
import Loader from '../ui/Loader'
import Models from './Sections/Models/Section'
import Personalization from './Sections/Personalization'
import Preferences from './Sections/Preferences'
import SearchSection from './Sections/Search'
import { apiFetch } from '@/lib/simplicity/api-fetch'

const sections = [
  {
    key: 'preferences',
    name: 'Preferences',
    description: 'Customize your application preferences.',
    icon: Sliders,
    component: Preferences,
    dataAdd: 'preferences',
  },
  {
    key: 'personalization',
    name: 'Personalization',
    description: 'Customize the behavior and tone of the model.',
    icon: ToggleRight,
    component: Personalization,
    dataAdd: 'personalization',
  },
  {
    key: 'models',
    name: 'Models',
    description: 'Connect to AI services and manage connections.',
    icon: BrainCog,
    component: Models,
    dataAdd: 'modelProviders',
  },
  {
    key: 'search',
    name: 'Search',
    description: 'Manage search settings.',
    icon: Search,
    component: SearchSection,
    dataAdd: 'search',
  },
]

const SettingsDialogue = ({
  isOpen,
  setIsOpen,
}: {
  isOpen: boolean
  setIsOpen: (active: boolean) => void
}) => {
  const [isLoading, setIsLoading] = useState(true)
  const [config, setConfig] = useState<any>(null)
  const [activeSection, setActiveSection] = useState<string>(sections[0].key)
  const [selectedSection, setSelectedSection] = useState(sections[0])

  useEffect(() => {
    setSelectedSection(sections.find((s) => s.key === activeSection)!)
  }, [activeSection])

  useEffect(() => {
    if (isOpen) {
      const fetchConfig = async () => {
        try {
          const res = await apiFetch('/api/config', {
            method: 'GET',
            headers: {
              'Content-Type': 'application/json',
            },
          })

          const data = await res.json()

          setConfig(data)
        } catch (_error) {
          toast.error('Failed to load configuration.')
        } finally {
          setIsLoading(false)
        }
      }

      fetchConfig()
    }
  }, [isOpen])

  return (
    <Dialog
      open={isOpen}
      onClose={() => setIsOpen(false)}
      className="relative z-50"
    >
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.1 }}
        className="fixed inset-0 flex h-screen w-screen items-center justify-center bg-black/30 p-4 backdrop-blur-sm"
      >
        <DialogPanel className="flex h-[calc(100vh-2%)] w-[calc(100vw-2%)] flex-col space-y-4 overflow-hidden rounded-xl border border-light-200 bg-light-primary backdrop-blur-lg md:h-[calc(100vh-7%)] md:w-[calc(100vw-7%)] lg:h-[calc(100vh-20%)] lg:w-[calc(100vw-30%)] dark:border-dark-200 dark:bg-dark-primary">
          {isLoading ? (
            <div className="flex h-full w-full items-center justify-center">
              <Loader />
            </div>
          ) : (
            <div className="inset-0 flex h-full flex-1 overflow-hidden">
              <div className="hidden h-full w-[240px] flex-col justify-between overflow-y-auto border-white-200 border-r px-3 pt-3 lg:flex dark:border-dark-200">
                <div className="flex flex-col">
                  <button
                    onClick={() => setIsOpen(false)}
                    className="group flex flex-row items-center rounded-lg p-2 hover:bg-light-200 hover:dark:bg-dark-200"
                  >
                    <ChevronLeft
                      size={18}
                      className="text-black/50 group-hover:text-black/70 dark:text-white/50 group-hover:dark:text-white/70"
                    />
                    <p className="text-[14px] text-black/50 group-hover:text-black/70 dark:text-white/50 group-hover:dark:text-white/70">
                      Back
                    </p>
                  </button>

                  <div className="mt-8 flex flex-col items-start space-y-1">
                    {sections.map((section) => (
                      <button
                        key={section.dataAdd}
                        className={cn(
                          `flex w-full flex-row items-center space-x-2 rounded-lg px-2 py-1.5 text-sm transition duration-200 hover:bg-light-200 active:scale-95 hover:dark:bg-dark-200`,
                          activeSection === section.key
                            ? 'bg-light-200 text-black/90 dark:bg-dark-200 dark:text-white/90'
                            : 'text-black/70 dark:text-white/70',
                        )}
                        onClick={() => setActiveSection(section.key)}
                      >
                        <section.icon size={17} />
                        <p>{section.name}</p>
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex flex-col space-y-1 px-2 py-[18px]">
                  <p className="text-black/70 text-xs dark:text-white/70">
                    Version: {process.env.NEXT_PUBLIC_VERSION}
                  </p>
                  <a
                    href="https://github.com/itzcrazykns/vane"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex flex-row items-center space-x-1 text-black/70 text-xs transition duration-200 hover:text-black/90 dark:text-white/70 hover:dark:text-white/90"
                  >
                    <span>GitHub</span>
                    <ExternalLink size={12} />
                  </a>
                </div>
              </div>
              <div className="flex w-full flex-col overflow-hidden">
                <div className="my-4 flex w-full flex-shrink-0 flex-row justify-between px-[20px] lg:hidden">
                  <button
                    onClick={() => setIsOpen(false)}
                    className="group mr-[40%] flex flex-row items-center rounded-lg hover:bg-light-200 hover:dark:bg-dark-200"
                  >
                    <ArrowLeft
                      size={18}
                      className="text-black/50 group-hover:text-black/70 dark:text-white/50 group-hover:dark:text-white/70"
                    />
                  </button>
                  <Select
                    options={sections.map((section) => {
                      return {
                        value: section.key,
                        key: section.key,
                        label: section.name,
                      }
                    })}
                    value={activeSection}
                    onChange={(e) => {
                      setActiveSection(e.target.value)
                    }}
                    className="!text-xs lg:!text-sm"
                  />
                </div>
                {selectedSection.component && (
                  <div className="flex flex-1 flex-col overflow-hidden">
                    <div className="flex-shrink-0 border-light-200/60 border-b px-6 pb-6 lg:pt-6 dark:border-dark-200/60">
                      <div className="flex flex-col">
                        <h4 className="font-medium text-black text-sm lg:text-sm dark:text-white">
                          {selectedSection.name}
                        </h4>
                        <p className="text-[11px] text-black/50 lg:text-xs dark:text-white/50">
                          {selectedSection.description}
                        </p>
                      </div>
                    </div>
                    <div className="flex-1 overflow-y-auto">
                      <selectedSection.component
                        fields={config.fields[selectedSection.dataAdd]}
                        values={config.values[selectedSection.dataAdd]}
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </DialogPanel>
      </motion.div>
    </Dialog>
  )
}

export default SettingsDialogue
