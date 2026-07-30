import { AnimatePresence } from 'motion/react'
import { Settings } from 'lucide-react'
import { useState } from 'react'
import SettingsDialogue from './SettingsDialogue'

const SettingsButton = () => {
  const [isOpen, setIsOpen] = useState<boolean>(false)

  return (
    <>
      <div
        className="cursor-pointer rounded-full bg-light-200 p-2.5 text-black/70 transition duration-200 hover:scale-105 hover:opacity-70 active:scale-95 dark:bg-dark-200 dark:text-white/70"
        onClick={() => setIsOpen(true)}
      >
        <Settings size={19} className="cursor-pointer" />
      </div>
      <AnimatePresence>
        {isOpen && <SettingsDialogue isOpen={isOpen} setIsOpen={setIsOpen} />}
      </AnimatePresence>
    </>
  )
}

export default SettingsButton
