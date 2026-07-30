import { AnimatePresence } from 'motion/react'
import { Settings } from 'lucide-react'
import { useState } from 'react'
import SettingsDialogue from './SettingsDialogue'

const SettingsButtonMobile = () => {
  const [isOpen, setIsOpen] = useState<boolean>(false)

  return (
    <>
      <button className="lg:hidden" onClick={() => setIsOpen(true)}>
        <Settings size={18} />
      </button>
      <AnimatePresence>
        {isOpen && <SettingsDialogue isOpen={isOpen} setIsOpen={setIsOpen} />}
      </AnimatePresence>
    </>
  )
}

export default SettingsButtonMobile
