declare module 'svg-captcha' {
  export type CaptchaOptions = {
    size?: number
    ignoreChars?: string
    noise?: number
    color?: boolean
    background?: string
    width?: number
    height?: number
    fontSize?: number
  }

  export type Captcha = {
    text: string
    data: string
  }

  export function create(options?: CaptchaOptions): Captcha
}
