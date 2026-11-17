import {
  Anthropic,
  Azure,
  Bedrock,
  Gemini,
  Kimi,
  LmStudio,
  Ollama,
  OpenAI,
  OpenRouter,
  Qwen,
} from '@lobehub/icons'
import { Bot, Github } from 'lucide-react'
import type { FC, SVGProps } from 'react'
import ProductLogoSvg from '@/assets/product_logo.svg'
import PublikLogoSvg from '@/assets/publik_logo.svg'
import { isPublikAgentProviderId } from '@/lib/publik/agent-provider-ids'
import type { ProviderType } from './types'

interface IconProps extends SVGProps<SVGSVGElement> {
  size?: number | string
}

type IconComponent = FC<IconProps>

const providerIconMap: Record<ProviderType, IconComponent | null> = {
  anthropic: Anthropic,
  openai: OpenAI,
  'openai-compatible': OpenAI,
  google: Gemini,
  openrouter: OpenRouter,
  azure: Azure,
  ollama: Ollama,
  lmstudio: LmStudio,
  bedrock: Bedrock,
  browseros: null,
  moonshot: Kimi,
  'chatgpt-pro': OpenAI,
  'github-copilot': Github,
  'qwen-code': Qwen,
  codex: OpenAI,
  'claude-code': Anthropic,
  'acp-custom': null,
}

export interface ProviderIconProps {
  type: ProviderType
  /** A publik tier entry is openai-compatible; its id picks the publik mark. */
  providerId?: string
  size?: number
  className?: string
}

/**
 * Provider icon component that renders the appropriate icon for each provider type
 * @public
 */
export const ProviderIcon: FC<ProviderIconProps> = ({
  type,
  providerId,
  size = 20,
  className,
}) => {
  if (isPublikAgentProviderId(providerId)) {
    return <PublikIcon size={size} className={className} />
  }
  const IconComponent = providerIconMap[type]

  if (IconComponent) {
    return <IconComponent size={size} className={className} />
  }

  return <Bot size={size} className={className} />
}

/**
 * Astro branded icon component
 * @public
 */
export const AstroIcon: FC<{ size?: number; className?: string }> = ({
  size = 20,
  className,
}) => {
  return (
    <img
      src={ProductLogoSvg}
      alt="Astro"
      width={size}
      height={size}
      className={className}
    />
  )
}

/**
 * publik mark for the publik API tiers
 * @public
 */
export const PublikIcon: FC<{ size?: number; className?: string }> = ({
  size = 20,
  className,
}) => (
  <img
    src={PublikLogoSvg}
    alt="publik"
    width={size}
    height={size}
    className={className}
  />
)
