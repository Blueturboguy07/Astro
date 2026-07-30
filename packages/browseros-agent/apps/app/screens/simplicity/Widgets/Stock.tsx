'use client'

import {
  BaselineSeries,
  ColorType,
  createChart,
  LineSeries,
  LineStyle,
} from 'lightweight-charts'
import { ArrowDownRight, ArrowUpRight, Clock, Minus } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

type StockWidgetProps = {
  symbol: string
  shortName: string
  longName?: string
  exchange?: string
  currency?: string
  marketState?: string
  regularMarketPrice?: number
  regularMarketChange?: number
  regularMarketChangePercent?: number
  regularMarketPreviousClose?: number
  regularMarketOpen?: number
  regularMarketDayHigh?: number
  regularMarketDayLow?: number
  regularMarketVolume?: number
  averageDailyVolume3Month?: number
  marketCap?: number
  fiftyTwoWeekLow?: number
  fiftyTwoWeekHigh?: number
  trailingPE?: number
  forwardPE?: number
  dividendYield?: number
  earningsPerShare?: number
  website?: string
  postMarketPrice?: number
  postMarketChange?: number
  postMarketChangePercent?: number
  preMarketPrice?: number
  preMarketChange?: number
  preMarketChangePercent?: number
  chartData?: {
    '1D'?: { timestamps: number[]; prices: number[] } | null
    '5D'?: { timestamps: number[]; prices: number[] } | null
    '1M'?: { timestamps: number[]; prices: number[] } | null
    '3M'?: { timestamps: number[]; prices: number[] } | null
    '6M'?: { timestamps: number[]; prices: number[] } | null
    '1Y'?: { timestamps: number[]; prices: number[] } | null
    MAX?: { timestamps: number[]; prices: number[] } | null
  } | null
  comparisonData?: Array<{
    ticker: string
    name: string
    chartData: {
      '1D'?: { timestamps: number[]; prices: number[] } | null
      '5D'?: { timestamps: number[]; prices: number[] } | null
      '1M'?: { timestamps: number[]; prices: number[] } | null
      '3M'?: { timestamps: number[]; prices: number[] } | null
      '6M'?: { timestamps: number[]; prices: number[] } | null
      '1Y'?: { timestamps: number[]; prices: number[] } | null
      MAX?: { timestamps: number[]; prices: number[] } | null
    }
  }> | null
  error?: string
}

const formatNumber = (num: number | undefined, decimals = 2): string => {
  if (num === undefined || num === null) return 'N/A'
  return num.toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
}

const formatLargeNumber = (num: number | undefined): string => {
  if (num === undefined || num === null) return 'N/A'
  if (num >= 1e12) return `$${(num / 1e12).toFixed(2)}T`
  if (num >= 1e9) return `$${(num / 1e9).toFixed(2)}B`
  if (num >= 1e6) return `$${(num / 1e6).toFixed(2)}M`
  if (num >= 1e3) return `$${(num / 1e3).toFixed(2)}K`
  return `$${num.toFixed(2)}`
}

const Stock = (props: StockWidgetProps) => {
  const [isDarkMode, setIsDarkMode] = useState(false)
  const [selectedTimeframe, setSelectedTimeframe] = useState<
    '1D' | '5D' | '1M' | '3M' | '6M' | '1Y' | 'MAX'
  >('1M')
  const chartContainerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const checkDarkMode = () => {
      setIsDarkMode(document.documentElement.classList.contains('dark'))
    }

    checkDarkMode()

    const observer = new MutationObserver(checkDarkMode)
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    })

    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const currentChartData = props.chartData?.[selectedTimeframe]
    if (
      !chartContainerRef.current ||
      !currentChartData ||
      currentChartData.timestamps.length === 0
    ) {
      return
    }

    const chart = createChart(chartContainerRef.current, {
      width: chartContainerRef.current.clientWidth,
      height: 280,
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: isDarkMode ? '#6b7280' : '#9ca3af',
        fontSize: 11,
        attributionLogo: false,
      },
      grid: {
        vertLines: {
          color: isDarkMode ? '#21262d' : '#e8edf1',
          style: LineStyle.Solid,
        },
        horzLines: {
          color: isDarkMode ? '#21262d' : '#e8edf1',
          style: LineStyle.Solid,
        },
      },
      crosshair: {
        vertLine: {
          color: isDarkMode ? '#30363d' : '#d0d7de',
          labelVisible: false,
        },
        horzLine: {
          color: isDarkMode ? '#30363d' : '#d0d7de',
          labelVisible: true,
        },
      },
      rightPriceScale: {
        borderVisible: false,
        visible: false,
      },
      leftPriceScale: {
        borderVisible: false,
        visible: true,
      },
      timeScale: {
        borderVisible: false,
        timeVisible: false,
      },
      handleScroll: false,
      handleScale: false,
    })

    const prices = currentChartData.prices
    let baselinePrice: number

    if (selectedTimeframe === '1D') {
      baselinePrice = props.regularMarketPreviousClose ?? prices[0]
    } else {
      baselinePrice = prices[0]
    }

    const baselineSeries = chart.addSeries(BaselineSeries)

    baselineSeries.applyOptions({
      baseValue: { type: 'price', price: baselinePrice },
      topLineColor: isDarkMode ? '#14b8a6' : '#0d9488',
      topFillColor1: isDarkMode
        ? 'rgba(20, 184, 166, 0.28)'
        : 'rgba(13, 148, 136, 0.24)',
      topFillColor2: isDarkMode
        ? 'rgba(20, 184, 166, 0.05)'
        : 'rgba(13, 148, 136, 0.05)',
      bottomLineColor: isDarkMode ? '#f87171' : '#dc2626',
      bottomFillColor1: isDarkMode
        ? 'rgba(248, 113, 113, 0.05)'
        : 'rgba(220, 38, 38, 0.05)',
      bottomFillColor2: isDarkMode
        ? 'rgba(248, 113, 113, 0.28)'
        : 'rgba(220, 38, 38, 0.24)',
      lineWidth: 2,
      crosshairMarkerVisible: true,
      crosshairMarkerRadius: 4,
      crosshairMarkerBorderColor: '',
      crosshairMarkerBackgroundColor: '',
    })

    const data = currentChartData.timestamps.map((timestamp, index) => {
      const price = currentChartData.prices[index]
      return {
        time: (timestamp / 1000) as any,
        value: price,
      }
    })

    baselineSeries.setData(data)

    const comparisonColors = ['#8b5cf6', '#f59e0b', '#ec4899']
    if (props.comparisonData && props.comparisonData.length > 0) {
      props.comparisonData.forEach((comp, index) => {
        const compChartData = comp.chartData[selectedTimeframe]
        if (compChartData && compChartData.prices.length > 0) {
          const compData = compChartData.timestamps.map((timestamp, i) => ({
            time: (timestamp / 1000) as any,
            value: compChartData.prices[i],
          }))

          const compSeries = chart.addSeries(LineSeries)
          compSeries.applyOptions({
            color: comparisonColors[index] || '#6b7280',
            lineWidth: 2,
            crosshairMarkerVisible: true,
            crosshairMarkerRadius: 4,
            priceScaleId: 'left',
          })
          compSeries.setData(compData)
        }
      })
    }

    chart.timeScale().fitContent()

    const handleResize = () => {
      if (chartContainerRef.current) {
        chart.applyOptions({
          width: chartContainerRef.current.clientWidth,
        })
      }
    }

    window.addEventListener('resize', handleResize)

    return () => {
      window.removeEventListener('resize', handleResize)
      chart.remove()
    }
  }, [
    props.chartData,
    props.comparisonData,
    selectedTimeframe,
    isDarkMode,
    props.regularMarketPreviousClose,
  ])

  const isPositive = (props.regularMarketChange ?? 0) >= 0
  const isMarketOpen = props.marketState === 'REGULAR'
  const isPreMarket = props.marketState === 'PRE'
  const isPostMarket = props.marketState === 'POST'

  const displayPrice = isPostMarket
    ? (props.postMarketPrice ?? props.regularMarketPrice)
    : isPreMarket
      ? (props.preMarketPrice ?? props.regularMarketPrice)
      : props.regularMarketPrice

  const displayChange = isPostMarket
    ? (props.postMarketChange ?? props.regularMarketChange)
    : isPreMarket
      ? (props.preMarketChange ?? props.regularMarketChange)
      : props.regularMarketChange

  const displayChangePercent = isPostMarket
    ? (props.postMarketChangePercent ?? props.regularMarketChangePercent)
    : isPreMarket
      ? (props.preMarketChangePercent ?? props.regularMarketChangePercent)
      : props.regularMarketChangePercent

  const changeColor = isPositive
    ? 'text-green-600 dark:text-green-400'
    : 'text-red-600 dark:text-red-400'

  if (props.error) {
    return (
      <div className="rounded-lg border border-light-200 bg-light-secondary p-4 dark:border-dark-200 dark:bg-dark-secondary">
        <p className="text-black text-sm dark:text-white">
          Error: {props.error}
        </p>
      </div>
    )
  }

  return (
    <div className="overflow-hidden rounded-lg border border-light-200 dark:border-dark-200">
      <div className="space-y-4 p-4">
        <div className="flex items-start justify-between gap-4 border-light-200 border-b pb-4 dark:border-dark-200">
          <div className="flex-1">
            <div className="mb-1 flex items-center gap-2">
              {props.website && (
                <img
                  src={`https://logo.clearbit.com/${new URL(props.website).hostname}`}
                  alt={`${props.symbol} logo`}
                  className="h-8 w-8 rounded-lg"
                  onError={(e) => {
                    ;(e.target as HTMLImageElement).style.display = 'none'
                  }}
                />
              )}
              <h3 className="font-bold text-2xl text-black dark:text-white">
                {props.symbol}
              </h3>
              {props.exchange && (
                <span className="rounded bg-light-100 px-2 py-0.5 font-medium text-black/60 text-xs dark:bg-dark-100 dark:text-white/60">
                  {props.exchange}
                </span>
              )}
              {isMarketOpen && (
                <div className="flex items-center gap-1.5 rounded-full border border-green-300 bg-green-100 px-2 py-0.5 dark:border-green-800 dark:bg-green-950/40">
                  <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-green-500" />
                  <span className="font-medium text-green-700 text-xs dark:text-green-400">
                    Live
                  </span>
                </div>
              )}
              {isPreMarket && (
                <div className="flex items-center gap-1.5 rounded-full border border-blue-300 bg-blue-100 px-2 py-0.5 dark:border-blue-800 dark:bg-blue-950/40">
                  <Clock className="h-3 w-3 text-blue-600 dark:text-blue-400" />
                  <span className="font-medium text-blue-700 text-xs dark:text-blue-400">
                    Pre-Market
                  </span>
                </div>
              )}
              {isPostMarket && (
                <div className="flex items-center gap-1.5 rounded-full border border-orange-300 bg-orange-100 px-2 py-0.5 dark:border-orange-800 dark:bg-orange-950/40">
                  <Clock className="h-3 w-3 text-orange-600 dark:text-orange-400" />
                  <span className="font-medium text-orange-700 text-xs dark:text-orange-400">
                    After Hours
                  </span>
                </div>
              )}
            </div>
            <p className="text-black/60 text-sm dark:text-white/60">
              {props.longName || props.shortName}
            </p>
          </div>

          <div className="text-right">
            <div className="mb-1 flex items-baseline gap-2">
              <span className="font-medium text-3xl text-black dark:text-white">
                {props.currency === 'USD' ? '$' : ''}
                {formatNumber(displayPrice)}
              </span>
            </div>
            <div
              className={`flex items-center justify-end gap-1 ${changeColor}`}
            >
              {isPositive ? (
                <ArrowUpRight className="h-4 w-4" />
              ) : displayChange === 0 ? (
                <Minus className="h-4 w-4" />
              ) : (
                <ArrowDownRight className="h-4 w-4" />
              )}
              <span className="font-normal text-lg">
                {displayChange !== undefined && displayChange >= 0 ? '+' : ''}
                {formatNumber(displayChange)}
              </span>
              <span className="font-normal text-sm">
                (
                {displayChangePercent !== undefined && displayChangePercent >= 0
                  ? '+'
                  : ''}
                {formatNumber(displayChangePercent)}%)
              </span>
            </div>
          </div>
        </div>

        {props.chartData && (
          <div className="overflow-hidden rounded-lg bg-light-secondary dark:bg-dark-secondary">
            <div className="flex items-center justify-between border-light-200 border-b p-3 dark:border-dark-200">
              <div className="flex items-center gap-1">
                {(['1D', '5D', '1M', '3M', '6M', '1Y', 'MAX'] as const).map(
                  (timeframe) => (
                    <button
                      key={timeframe}
                      onClick={() => setSelectedTimeframe(timeframe)}
                      disabled={!props.chartData?.[timeframe]}
                      className={`rounded px-3 py-1.5 font-medium text-xs transition-colors ${
                        selectedTimeframe === timeframe
                          ? 'bg-black/10 text-black dark:bg-white/10 dark:text-white'
                          : 'text-black/50 hover:text-black/80 dark:text-white/50 dark:hover:text-white/80'
                      } disabled:cursor-not-allowed disabled:opacity-30`}
                    >
                      {timeframe}
                    </button>
                  ),
                )}
              </div>

              {props.comparisonData && props.comparisonData.length > 0 && (
                <div className="ml-auto flex items-center gap-3">
                  <span className="text-black/50 text-xs dark:text-white/50">
                    {props.symbol}
                  </span>
                  {props.comparisonData.map((comp, index) => {
                    const colors = ['#8b5cf6', '#f59e0b', '#ec4899']
                    return (
                      <div
                        key={comp.ticker}
                        className="flex items-center gap-1.5"
                      >
                        <div
                          className="h-2 w-2 rounded-full"
                          style={{ backgroundColor: colors[index] }}
                        />
                        <span className="text-black/70 text-xs dark:text-white/70">
                          {comp.ticker}
                        </span>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            <div className="p-4">
              <div ref={chartContainerRef} />
            </div>

            <div className="grid grid-cols-3 border-light-200 border-t dark:border-dark-200">
              <div className="flex justify-between border-light-200 border-r p-3 dark:border-dark-200">
                <span className="text-black/50 text-xs dark:text-white/50">
                  Prev Close
                </span>
                <span className="font-medium text-black text-xs dark:text-white">
                  ${formatNumber(props.regularMarketPreviousClose)}
                </span>
              </div>
              <div className="flex justify-between border-light-200 border-r p-3 dark:border-dark-200">
                <span className="text-black/50 text-xs dark:text-white/50">
                  52W Range
                </span>
                <span className="font-medium text-black text-xs dark:text-white">
                  ${formatNumber(props.fiftyTwoWeekLow, 2)}-$
                  {formatNumber(props.fiftyTwoWeekHigh, 2)}
                </span>
              </div>
              <div className="flex justify-between p-3">
                <span className="text-black/50 text-xs dark:text-white/50">
                  Market Cap
                </span>
                <span className="font-medium text-black text-xs dark:text-white">
                  {formatLargeNumber(props.marketCap)}
                </span>
              </div>
              <div className="flex justify-between border-light-200 border-t border-r p-3 dark:border-dark-200">
                <span className="text-black/50 text-xs dark:text-white/50">
                  Open
                </span>
                <span className="font-medium text-black text-xs dark:text-white">
                  ${formatNumber(props.regularMarketOpen)}
                </span>
              </div>
              <div className="flex justify-between border-light-200 border-t border-r p-3 dark:border-dark-200">
                <span className="text-black/50 text-xs dark:text-white/50">
                  P/E Ratio
                </span>
                <span className="font-medium text-black text-xs dark:text-white">
                  {props.trailingPE ? formatNumber(props.trailingPE, 2) : 'N/A'}
                </span>
              </div>
              <div className="flex justify-between border-light-200 border-t p-3 dark:border-dark-200">
                <span className="text-black/50 text-xs dark:text-white/50">
                  Dividend Yield
                </span>
                <span className="font-medium text-black text-xs dark:text-white">
                  {props.dividendYield
                    ? `${formatNumber(props.dividendYield * 100, 2)}%`
                    : 'N/A'}
                </span>
              </div>
              <div className="flex justify-between border-light-200 border-t border-r p-3 dark:border-dark-200">
                <span className="text-black/50 text-xs dark:text-white/50">
                  Day Range
                </span>
                <span className="font-medium text-black text-xs dark:text-white">
                  ${formatNumber(props.regularMarketDayLow, 2)}-$
                  {formatNumber(props.regularMarketDayHigh, 2)}
                </span>
              </div>
              <div className="flex justify-between border-light-200 border-t border-r p-3 dark:border-dark-200">
                <span className="text-black/50 text-xs dark:text-white/50">
                  Volume
                </span>
                <span className="font-medium text-black text-xs dark:text-white">
                  {formatLargeNumber(props.regularMarketVolume)}
                </span>
              </div>
              <div className="flex justify-between border-light-200 border-t p-3 dark:border-dark-200">
                <span className="text-black/50 text-xs dark:text-white/50">
                  EPS
                </span>
                <span className="font-medium text-black text-xs dark:text-white">
                  $
                  {props.earningsPerShare
                    ? formatNumber(props.earningsPerShare, 2)
                    : 'N/A'}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default Stock
