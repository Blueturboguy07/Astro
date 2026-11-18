/* Streamdown gives each code block content-visibility: auto. A block that
   is outside the viewport, or in a panel that has not painted a frame yet,
   is then skipped: its text is in the DOM, but innerText, a copied
   selection and some readers get nothing. The csv block of the same stub
   answer showed in full in one run and empty in the next (Astro 0.2.4 QA,
   UC-32 Windows). Chat code blocks are always rendered. */
export const CODE_BLOCK_ALWAYS_RENDERED =
  '[&_[data-streamdown="code-block"]]:[content-visibility:visible]!'
