'use client'

import { useEffect, useState } from 'react'
import {
  getShowNewsWidget,
  getShowWeatherWidget,
} from '@/lib/simplicity/config/clientRegistry'
import IncognitoToggle from '@/screens/simplicity/IncognitoToggle'
import SettingsButtonMobile from '@/screens/simplicity/Settings/SettingsButtonMobile'
import EmptyChatMessageInput from './EmptyChatMessageInput'
import NewsArticleWidget from './NewsArticleWidget'
import WeatherWidget from './WeatherWidget'

const EmptyChat = () => {
  const [showWeather, setShowWeather] = useState(() =>
    typeof window !== 'undefined' ? getShowWeatherWidget() : true,
  )
  const [showNews, setShowNews] = useState(() =>
    typeof window !== 'undefined' ? getShowNewsWidget() : true,
  )

  useEffect(() => {
    const updateWidgetVisibility = () => {
      setShowWeather(getShowWeatherWidget())
      setShowNews(getShowNewsWidget())
    }

    updateWidgetVisibility()

    window.addEventListener('client-config-changed', updateWidgetVisibility)
    window.addEventListener('storage', updateWidgetVisibility)

    return () => {
      window.removeEventListener(
        'client-config-changed',
        updateWidgetVisibility,
      )
      window.removeEventListener('storage', updateWidgetVisibility)
    }
  }, [])

  return (
    <div className="relative">
      <div className="absolute mt-5 flex w-full flex-row items-center justify-between px-5">
        {/* Perplexity ground truth: a circular lock button top-left of the
            composer toggles incognito for this thread only. */}
        <IncognitoToggle />
        <SettingsButtonMobile />
      </div>
      <div className="mx-auto flex min-h-screen max-w-screen-sm flex-col items-center justify-center space-y-4 p-2">
        <div className="flex w-full flex-col items-center justify-center space-y-8">
          <h2 className="-mt-8 font-normal font-serif text-4xl text-black/70 tracking-tight dark:text-white/70">
            Research begins here.
          </h2>
          <EmptyChatMessageInput />
        </div>
        {(showWeather || showNews) && (
          <div className="mt-2 flex w-full flex-col gap-4 sm:flex-row sm:justify-center">
            {showWeather && (
              <div className="w-full flex-1">
                <WeatherWidget />
              </div>
            )}
            {showNews && (
              <div className="w-full flex-1">
                <NewsArticleWidget />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export default EmptyChat
