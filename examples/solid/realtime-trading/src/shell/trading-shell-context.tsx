import { createContext, useContext } from 'solid-js'
import type { JSX } from '@solidjs/web'
import type { MarketFeedController } from '../feed/market-feed-controller'
import type { TradingBenchmarkController } from '../benchmark/trading-benchmark-controller'

const TradingShellContext = createContext<TradingBenchmarkController>()
const MarketFeedContext = createContext<MarketFeedController>()

export function MarketFeedProvider(props: {
  controller: MarketFeedController
  children: JSX.Element
}) {
  return (
    <MarketFeedContext value={props.controller}>
      {props.children}
    </MarketFeedContext>
  )
}

export function TradingShellProvider(props: {
  controller: TradingBenchmarkController
  children: JSX.Element
}) {
  return (
    <MarketFeedProvider controller={props.controller.feed}>
      <TradingShellContext value={props.controller}>
        {props.children}
      </TradingShellContext>
    </MarketFeedProvider>
  )
}

export function useMarketFeedController(): MarketFeedController {
  const controller = useContext(MarketFeedContext)
  if (!controller) {
    throw new Error(
      'Market data consumers must be rendered inside MarketFeedProvider',
    )
  }
  return controller
}

export function useTradingShellController(): TradingBenchmarkController {
  const controller = useContext(TradingShellContext)
  if (!controller) {
    throw new Error(
      'Trading shell components must be rendered inside TradingShellProvider',
    )
  }
  return controller
}
