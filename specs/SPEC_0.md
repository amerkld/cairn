I want to build a desktop note-taking, knowledge base, and reminder application that will be conceptually similar to an opinionated Obsidian but for individual use only. It will be called Cairn. It will very loosely implement vaults, a markdown editor, and my own version of the GTD methodology (Getting Things Done). It will all be built on Markdown files and be fully local (no cloud option), and build on principles from this gist created by Andrej Karpathy for future (but not this phase) AI integration: https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f



I want users to be able to have an "Captures" area (the Inbox in GTD methodology) where they can quickly type up notes, memos, paste screenshots, etc... for later filing/sorting. Captures should feel like a Miro page, with freedom to place anywhere. Each note can be expanded to be edited as a full markdown page and then put under a Project. Each project comes with an Actions directory, and any notes under that actions directory can be given a deadline. Alternatively, instead of putting the note under a Project a user might choose to leave it in the Captures for now, or send it to a Someday category (parking, with an option to be reminded in N days about it), or send it to the trash.



Users can create Projects and associate with those projects markdown files (similar to Notion) and other assets like images. In the Vault file structure itself, under each Project there should be an Actions directory for the markdown notes corresponding to Action items. Aside from the actions, users should be able to create directories under projects and in each create and edit markdown documents. Users should be able to configure Tags for each vault and assign Tags to markdown pages (or other custom headers/identifiers for the page).



On the home page, users should see an overview of the actions grouped by their projects and can drag to sort the actions in order they wish to execute them. There should be a Complete button (maybe just a checkmark) that the user can click which will archive the action with the option to let the user leave a note about it.





\## Design and Frontend Interface Requirements



The frontend must feel premium, focused, and modern.



\### Design direction



The product UI should take inspiration from the \*\*clarity, restraint, and polish\*\* of products like \*\*Linear\*\* and \*\*Arc\*\*.



That means:



\* clean, high-discipline layout



\* strong spacing and typography



\* minimal visual noise



\* sharp information hierarchy



\* dark-first, premium SaaS feel



\* subtle depth, borders, and contrast



\* smooth states and transitions



\* interface should feel fast, deliberate, and high-trust



This should \*\*not\*\* look like a generic admin dashboard template.



Avoid anything that feels bloated, overly colorful, or enterprise-corporate.



\### Accent color



The product accent color must be:



\* `#fac775`



This is the main accent for:



\* highlights



\* active states



\* buttons where appropriate



\* selected filters/tabs



\* emphasis elements



\* charts or score highlights sparingly



Use it with discipline.



\### Color system guidance



The interface should be primarily built around:



\* dark neutral backgrounds



\* soft border tones



\* muted secondary text



\* restrained use of the accent color



The accent color should stand out because it is used carefully, not everywhere.



\#### Avoid



\* oversaturating the UI with yellow/gold



\* large flat areas of bright accent color



\* cheap-looking gradients



\* noisy shadows



\* strong visual clutter



\### Visual tone



The interface should communicate:



\* calm



\* focus



\* confidence



The product is meant to be a focus and creativity tool so the UI should embody a "calm focus" feeling and premium, not playful.



\### Component styling direction



Prefer:



\* rounded corners, but restrained



\* thin borders



\* soft glassy or layered panel feel only if subtle



\* dense but readable tables



\* clean cards with clear hierarchy



\* elegant hover/active/focus states



\* strong empty states and loading states



\### Layout guidance



Use a structured app layout such as:



\* left sidebar navigation or a highly polished top/side shell



\* main content area with generous spacing



\* persistent page titles and context



\* modular sections for



The dashboard should feel like a product people would trust and find comfortable to use.



\### Typography



Typography should be clean and modern:



\* crisp sans-serif



\* strong hierarchy between page title, section title, body text, and metadata



\* avoid oversized headings unless justified



\* avoid crowded UI text



\### Table and dashboard behavior



The home dashboard and actions overview will probably be table heavy.



These tables must feel polished, not raw.



Requirements:



\* sticky headers where useful



\* strong spacing and alignment



\* readable row states



\* expandable detail panels for inbox items



\* use badges, chips, and subtle status indicators carefully



\### Motion and interaction



Interactions should feel refined:



\* subtle hover states



\* smooth transitions



\* tasteful loading skeletons



\* lightweight animations only where they improve clarity



Do not overanimate the UI.



\### Implementation guidance



Frontend should use a design system approach:



\* reusable primitives for buttons, cards, badges, tables, tabs, dialogs, and layout shells



\* consistent spacing scale



\* consistent radius, border, and color tokens



\* central theme configuration



\### Suggested frontend constraints



\* build dark mode first



\* keep the app visually consistent from the beginning



\* avoid template-looking UI



\* prioritize polish on the main flows:



&#x20; \* Home page



&#x20; \* Captures



&#x20; \* Projects



&#x20; \* Editor



\### Design acceptance bar



Do not consider the frontend done unless:



\* the UI has a distinct premium identity



\* the dashboard feels closer to Linear/Arc quality than a starter SaaS template



\* accent color usage is disciplined and branded around `#fac775`



