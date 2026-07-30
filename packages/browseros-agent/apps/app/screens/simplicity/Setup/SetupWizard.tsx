'use client'

import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useState } from 'react'
import type { UIConfigSections } from '@/lib/simplicity/config/types'
import SetupConfig from './SetupConfig'

const SetupWizard = ({
  configSections,
}: {
  configSections: UIConfigSections
}) => {
  const [showWelcome, setShowWelcome] = useState(true)
  const [showSetup, setShowSetup] = useState(false)
  const [setupState, setSetupState] = useState(1)

  const delay = (ms: number) =>
    new Promise((resolve) => setTimeout(resolve, ms))

  useEffect(() => {
    ;(async () => {
      await delay(2500)
      setShowWelcome(false)
      await delay(600)
      setShowSetup(true)
      setSetupState(1)
      await delay(1500)
      setSetupState(2)
    })()
  }, [delay])

  return (
    <div className="fixed inset-0 h-screen w-screen overflow-hidden bg-light-primary dark:bg-dark-primary">
      <AnimatePresence>
        {showWelcome && (
          <div className="absolute inset-0 flex items-center justify-center overflow-hidden">
            <motion.div
              className="absolute flex h-full flex-col items-center justify-center"
              initial={{ opacity: 1 }}
              exit={{ opacity: 0, scale: 1.1 }}
              transition={{ duration: 0.6 }}
            >
              <motion.h2
                transition={{ duration: 0.6 }}
                initial={{ opacity: 0, translateY: '30px' }}
                animate={{ opacity: 1, translateY: '0px' }}
                className="font-['Instrument_Serif'] font-normal text-4xl tracking-tight md:text-6xl xl:text-8xl"
              >
                Welcome to
                <span className="font-['PP_Editorial'] text-[#24A0ED] italic">
                  Astro
                </span>
              </motion.h2>
              <motion.p
                transition={{ delay: 0.8, duration: 0.7 }}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="mt-2 text-black/70 text-sm md:text-lg xl:text-2xl dark:text-white/70"
              >
                <span className="font-light">Web search,</span>{' '}
                <span className="font-['PP_Editorial'] font-light italic">
                  reimagined
                </span>
              </motion.p>
            </motion.div>
            <motion.div
              initial={{ opacity: 0, scale: 0.5 }}
              animate={{
                opacity: 0.2,
                scale: 1,
                transition: { delay: 0.8, duration: 0.7 },
              }}
              exit={{ opacity: 0, scale: 1.1, transition: { duration: 0.6 } }}
              className="relative left-50 z-40 h-[250px] w-[250px] translate-x-[-50%] rounded-full bg-[#24A0ED] blur-[100px]"
            />
          </div>
        )}
        {showSetup && (
          <div className="absolute inset-0 flex items-center justify-center overflow-hidden">
            <AnimatePresence mode="wait">
              {setupState === 1 && (
                <motion.p
                  key="setup-text"
                  transition={{ duration: 0.6 }}
                  initial={{ opacity: 0, translateY: '30px' }}
                  animate={{ opacity: 1, translateY: '0px' }}
                  exit={{
                    opacity: 0,
                    translateY: '-30px',
                    transition: { duration: 0.6 },
                  }}
                  className="font-['Instrument_Serif'] font-normal text-2xl tracking-tight md:text-4xl xl:text-6xl"
                >
                  Let us get
                  <span className="font-['PP_Editorial'] text-[#24A0ED] italic">
                    Astro
                  </span>{' '}
                  set up for you
                </motion.p>
              )}
              {setupState > 1 && (
                <motion.div
                  key="setup-config"
                  initial={{ opacity: 0, translateY: '30px' }}
                  animate={{
                    opacity: 1,
                    translateY: '0px',
                    transition: { duration: 0.6 },
                  }}
                >
                  <SetupConfig
                    configSections={configSections}
                    setupState={setupState}
                    setSetupState={setSetupState}
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}
      </AnimatePresence>
    </div>
  )
}

export default SetupWizard
