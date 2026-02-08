import { handle as handleAskName } from './etapas/askName.mjs'
import { handle as handleConfirmName } from './etapas/confirmName.mjs'
import { handle as handleAskEmail } from './etapas/askEmail.mjs'
import { handle as handleConfirmEmail } from './etapas/confirmEmail.mjs'
import { handle as handleAskCrushNameChoice } from './etapas/askCrushNameChoice.mjs'
import { handle as handleAskCrushNameInput } from './etapas/askCrushNameInput.mjs'
import { handle as handleAskPersonality } from './etapas/askPersonality.mjs'
import { handle as handleAskEthnicity } from './etapas/askEthnicity.mjs'
import { handle as handleAskAge } from './etapas/askAge.mjs'
import { handle as handleAskHairStyle } from './etapas/askHairStyle.mjs'
import { handle as handleAskHairColor } from './etapas/askHairColor.mjs'
import { handle as handleAskBodyType } from './etapas/askBodyType.mjs'
import { handle as handleAskBreastSize } from './etapas/askBreastSize.mjs'
import { handle as handleAskButtSize } from './etapas/askButtSize.mjs'
import { handle as handleAskSexualPreference } from './etapas/askSexualPreference.mjs'
import { handle as handleAskOccupation } from './etapas/askOccupation.mjs'
import { handle as handleAskClothing } from './etapas/askClothing.mjs'
import { handle as handleAskCommModeFinal } from './etapas/askCommModeFinal.mjs'
import { handle as handleAskTermsFinal } from './etapas/askTermsFinal.mjs'

export async function rotearEtapaOnboarding(ctx) {
  const step = ctx?.state?.step
  if (!step) return false

  if (step === 'askName') return handleAskName(ctx)
  if (step === 'confirmName') return handleConfirmName(ctx)
  if (step === 'askEmail') return handleAskEmail(ctx)
  if (step === 'confirmEmail') return handleConfirmEmail(ctx)
  if (step === 'askCrushNameChoice') return handleAskCrushNameChoice(ctx)
  if (step === 'askCrushNameInput') return handleAskCrushNameInput(ctx)
  if (step === 'askPersonality') return handleAskPersonality(ctx)
  if (step === 'askEthnicity') return handleAskEthnicity(ctx)
  if (step === 'askAge') return handleAskAge(ctx)
  if (step === 'askHairStyle') return handleAskHairStyle(ctx)
  if (step === 'askHairColor') return handleAskHairColor(ctx)
  if (step === 'askBodyType') return handleAskBodyType(ctx)
  if (step === 'askBreastSize') return handleAskBreastSize(ctx)
  if (step === 'askButtSize') return handleAskButtSize(ctx)
  if (step === 'askSexualPreference') return handleAskSexualPreference(ctx)
  if (step === 'askOccupation') return handleAskOccupation(ctx)
  if (step === 'askClothing') return handleAskClothing(ctx)
  if (step === 'askCommModeFinal') return handleAskCommModeFinal(ctx)
  if (step === 'askTermsFinal') return handleAskTermsFinal(ctx)

  return false
}
