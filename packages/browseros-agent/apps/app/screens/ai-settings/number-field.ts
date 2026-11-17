/** The form value of a number input. An empty or half-typed field ("", "-")
    stays empty, so the person can clear it and the form says "Enter a
    number"; Number("") used to snap it to 0 (Astro 0.2.4 QA, F-087). */
export function numberFieldValue(input: {
  value: string
  valueAsNumber: number
}): number | '' {
  if (input.value.trim() === '') return ''
  return Number.isNaN(input.valueAsNumber) ? '' : input.valueAsNumber
}
