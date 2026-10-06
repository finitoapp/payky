import { createRun } from "@evolu/web"
import {
  CircleCheckIcon,
  LoaderCircleIcon,
  MailIcon,
  PhoneIcon,
  SendIcon,
} from "lucide-react"
import { type FormEvent, useId, useState } from "react"
import { z } from "zod"

import { Button } from "@/components/ui/button.tsx"
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field.tsx"
import { Input } from "@/components/ui/input.tsx"
import { Textarea } from "@/components/ui/textarea.tsx"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group.tsx"
import { createFetchDep } from "@/core/deps.ts"
import { sendContactMessage } from "@/core/integrations/contact-client.ts"
import type { ContactMessage } from "@/core/modules/contact/contact-message.ts"
import { useLandingTranslation } from "@/features/landing/landing-translation.ts"
import type { Language, TranslationKey } from "@/i18n/resources.ts"
import { cn } from "@/lib/utils.ts"

/** Which one of the two the sender gives; the other stays empty. */
type Channel = "email" | "phone"

interface ContactFormValues {
  readonly channel: Channel
  readonly email: string
  readonly phone: string
  readonly message: string
  readonly businessName: string
  readonly place: string
  /** The honeypot; never shown, so only a bot fills it (support/0003). */
  readonly website: string
}

const emptyValues: ContactFormValues = {
  channel: "email",
  email: "",
  phone: "",
  message: "",
  businessName: "",
  place: "",
  website: "",
}

type FieldErrors = Partial<Record<Channel, TranslationKey>>

const optional = (value: string): string | undefined =>
  value.trim() === "" ? undefined : value.trim()

/** The form's one check: a usable address for the channel the sender picked. */
const validate = (
  values: ContactFormValues
): { readonly errors: FieldErrors; readonly ok: boolean } => {
  const errors: FieldErrors =
    values.channel === "email"
      ? z.email().safeParse(values.email.trim()).success
        ? {}
        : { email: "landing.contact.error.email" }
      : values.phone.trim().length >= 3
        ? {}
        : { phone: "landing.contact.error.phone" }
  return { errors, ok: Object.keys(errors).length === 0 }
}

const toContactMessage = (
  values: ContactFormValues,
  language: Language
): ContactMessage => ({
  email: values.channel === "email" ? optional(values.email) : undefined,
  phone: values.channel === "phone" ? optional(values.phone) : undefined,
  message: optional(values.message),
  businessName: optional(values.businessName),
  place: optional(values.place),
  language,
  website: optional(values.website),
})

/** Inputs sit on a tinted surface instead of inside a border. */
const inputClassName =
  "h-11 border-transparent bg-muted px-3.5 shadow-none focus-visible:border-transparent aria-invalid:border-transparent dark:bg-muted"

const channelItemClassName =
  "h-11 flex-1 rounded-full bg-muted px-5 text-base font-semibold text-muted-foreground data-pressed:bg-primary data-pressed:text-primary-foreground hover:bg-muted hover:text-foreground"

function OptionalMark() {
  const { t } = useLandingTranslation()
  return (
    <span className="font-normal text-muted-foreground">
      ({t("landing.contact.optional")})
    </span>
  )
}

/** What the form shows after a message got through. */
function ContactSent({ onReset }: { readonly onReset: () => void }) {
  const { t } = useLandingTranslation()
  return (
    <div
      className="flex flex-col items-start gap-3 rounded-2xl bg-muted p-6"
      role="status"
    >
      <CircleCheckIcon
        aria-hidden="true"
        className="size-8 text-(--landing-ink)"
      />
      <p className="text-xl font-bold">{t("landing.contact.sent.title")}</p>
      <p className="text-muted-foreground">{t("landing.contact.sent.body")}</p>
      <Button variant="secondary" className="mt-2" onClick={onReset}>
        {t("landing.contact.sent.another")}
      </Button>
    </div>
  )
}

/**
 * Runs its one Task on a run of its own: the landing page loads no account,
 * so `useAppRun` and the app's toaster are not there (landing/0002). A
 * failure is said next to the button instead.
 */
export function LandingContactForm() {
  const { language, t } = useLandingTranslation()
  const id = useId()
  const [values, setValues] = useState<ContactFormValues>(emptyValues)
  const [errors, setErrors] = useState<FieldErrors>({})
  const [pending, setPending] = useState(false)
  const [failed, setFailed] = useState(false)
  const [sent, setSent] = useState(false)

  const update = (patch: Partial<ContactFormValues>) =>
    setValues((previous) => ({ ...previous, ...patch }))

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const checked = validate(values)
    setErrors(checked.errors)
    if (!checked.ok) return

    setPending(true)
    setFailed(false)
    try {
      await using run = createRun(createFetchDep())
      const result = await run(
        sendContactMessage(toContactMessage(values, language))
      )
      if (result.ok) {
        setSent(true)
        setValues(emptyValues)
      } else {
        setFailed(true)
      }
    } finally {
      setPending(false)
    }
  }

  if (sent) {
    return <ContactSent onReset={() => setSent(false)} />
  }

  const byEmail = values.channel === "email"

  return (
    <form onSubmit={handleSubmit} noValidate>
      <FieldGroup className="gap-7">
        <FieldSet className="gap-3">
          <FieldLegend className="text-lg font-semibold">
            {t("landing.contact.channel.legend")}
          </FieldLegend>
          <ToggleGroup
            value={[values.channel]}
            onValueChange={(selected) => {
              const next = selected[0]
              if (next === "email" || next === "phone") {
                update({ channel: next })
                setErrors({})
              }
            }}
            className="w-full"
          >
            <ToggleGroupItem value="email" className={channelItemClassName}>
              <MailIcon aria-hidden="true" data-icon="inline-start" />
              {t("landing.contact.channel.email")}
            </ToggleGroupItem>
            <ToggleGroupItem value="phone" className={channelItemClassName}>
              <PhoneIcon aria-hidden="true" data-icon="inline-start" />
              {t("landing.contact.channel.phone")}
            </ToggleGroupItem>
          </ToggleGroup>
          {byEmail ? (
            <Field data-invalid={errors.email !== undefined}>
              <FieldLabel htmlFor={`${id}-email`} className="sr-only">
                {t("landing.contact.email.label")}
              </FieldLabel>
              <Input
                id={`${id}-email`}
                type="email"
                value={values.email}
                onChange={(event) => update({ email: event.target.value })}
                placeholder={t("landing.contact.email.label")}
                aria-invalid={errors.email !== undefined}
                autoComplete="email"
                inputMode="email"
                className={cn(inputClassName, "text-base")}
              />
              {errors.email !== undefined ? (
                <FieldError>{t(errors.email)}</FieldError>
              ) : null}
            </Field>
          ) : (
            <Field data-invalid={errors.phone !== undefined}>
              <FieldLabel htmlFor={`${id}-phone`} className="sr-only">
                {t("landing.contact.phone.label")}
              </FieldLabel>
              <Input
                id={`${id}-phone`}
                type="tel"
                value={values.phone}
                onChange={(event) => update({ phone: event.target.value })}
                placeholder={t("landing.contact.phone.label")}
                aria-invalid={errors.phone !== undefined}
                autoComplete="tel"
                inputMode="tel"
                className={cn(inputClassName, "text-base")}
              />
              {errors.phone !== undefined ? (
                <FieldError>{t(errors.phone)}</FieldError>
              ) : null}
            </Field>
          )}
        </FieldSet>

        <FieldSet className="gap-4">
          <Field>
            <FieldLabel htmlFor={`${id}-message`}>
              {t("landing.contact.message.label")} <OptionalMark />
            </FieldLabel>
            <Textarea
              id={`${id}-message`}
              value={values.message}
              onChange={(event) => update({ message: event.target.value })}
              placeholder={t("landing.contact.message.placeholder")}
              rows={3}
              className={cn(inputClassName, "h-auto py-2.5")}
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor={`${id}-business`}>
                {t("landing.contact.business.label")} <OptionalMark />
              </FieldLabel>
              <Input
                id={`${id}-business`}
                value={values.businessName}
                onChange={(event) =>
                  update({ businessName: event.target.value })
                }
                autoComplete="organization"
                className={inputClassName}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor={`${id}-place`}>
                {t("landing.contact.place.label")} <OptionalMark />
              </FieldLabel>
              <Input
                id={`${id}-place`}
                value={values.place}
                onChange={(event) => update({ place: event.target.value })}
                autoComplete="address-level2"
                className={inputClassName}
              />
            </Field>
          </div>
        </FieldSet>

        {/* The honeypot: off screen and out of the tab order. */}
        <div
          aria-hidden="true"
          className="absolute -left-[9999px] size-px overflow-hidden"
        >
          <label>
            Website
            <input
              type="text"
              name="website"
              tabIndex={-1}
              autoComplete="off"
              value={values.website}
              onChange={(event) => update({ website: event.target.value })}
            />
          </label>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          {failed ? (
            <p className="text-sm text-destructive" role="alert">
              {t("landing.contact.failed")}
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">
              {t("landing.contact.privacy")}
            </p>
          )}
          <Button
            type="submit"
            size="lg"
            disabled={pending}
            className="h-11 rounded-full px-6 text-base font-semibold has-data-[icon=inline-start]:pl-5"
          >
            {pending ? (
              <LoaderCircleIcon
                aria-hidden="true"
                data-icon="inline-start"
                className="animate-spin"
              />
            ) : (
              <SendIcon aria-hidden="true" data-icon="inline-start" />
            )}
            {pending
              ? t("landing.contact.sending")
              : t("landing.contact.submit")}
          </Button>
        </div>
      </FieldGroup>
    </form>
  )
}
