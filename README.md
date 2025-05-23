<h1 align="center">⚡ 3-D Developer Portfolio</h1>
<p align="center">A fully-interactive, Three.js-powered portfolio built with React + TailwindCSS — deployed in one command to GitHub Pages.</p>

<div align="center">
  <img src="https://img.shields.io/github/deployments/zwingthomas/portfolio3js/github-pages?color=2EA043&label=github%20pages">
  <img src="https://img.shields.io/badge/three.js-%23000?style=flat&logo=three.js&logoColor=white">
  <img src="https://img.shields.io/badge/react-%2361DAFB?style=flat&logo=react&logoColor=black">
  <img src="https://img.shields.io/badge/tailwind-%2306B6D4?style=flat&logo=tailwindcss&logoColor=white">
  <img src="https://img.shields.io/badge/emailjs-%23D44638?style=flat&logo=gmail&logoColor=white">
</div>

---
## 🧠 Plans and Goals
As of now this repository follows a single tutorial, however, there are many very cool looking and distinct tutorials on Three.js. As this project gets more attention I will be adding more and more tutorials to this repository. For users who want to implement these assets, layouts, backgrounds, icons, etc. and use them on their own site, it will all be configurable in one file. You will be able to mix-and-match between a variety of tutorials. After this I expect to have a very solid grasp on Three.js and will begin making my own tutorials: continuing to add options for those who fork this repository.


## 🎬 Tutorials

Build and Deploy an **Amazing 3-D Web Developer Portfolio in React JS**  
[JavaScript Mastery (YouTube, 2 h 49 m)](https://youtu.be/0fYi8SGA20k)

I followed and remixed Patrick’s fantastic walkthrough, adding my own content, colors, and Easter eggs.  
All credit for the base idea and code structure goes to **@JS-Mastery**.

---

## 🚀 Features

| ✔ | Section | Tech & Notes |
|---|---------|-------------|
| 3-D Hero        | Animated developer mascot orbiting in space | `@react-three/fiber` · Drei helpers |
| About           | Markdown-style bio & skill badges | Tailwind utility classes |
| Experience      | Vertical timeline with motion | `react-vertical-timeline-component` |
| Projects        | Hover-lift cards, live-link & repo buttons | Framer Motion |
| Testimonials    | Carousel with “Read more” clamps | `react-intersection-observer` |
| Contact         | Form → **EmailJS** (no server) + toast | Validation & loading states |
| Starfield       | Instanced 3-D stars in WebGL | Suspense + `Preload` |
| CI/CD           | **`npm run deploy`** → GitHub Pages | Github Actions `gh-pages` CLI |

---

## 🧑‍💻 Tech Stack

| Layer           | Library / Tool |
|-----------------|----------------|
| 3-D Engine      | **Three.js** via `@react-three/fiber` |
| Animations      | **Framer Motion** |
| Styling         | **TailwindCSS** (+ custom gradients) |
| Email           | **EmailJS** browser SDK |
| State / Build   | React 18 + **Vite** |
| Deployment      | **GitHub Pages** (static) |

---

## 🔧 Local Setup

```bash
# 1 · Fork the repository and watch this repo for updates

# 2 · clone & install
git clone https://github.com/<username>/<repo-name>.git
cd <repo-name>
pnpm install          # or npm / yarn

# 3 · env secrets
cp .env.example .env

# 4 · dev server
pnpm dev
```
-- Requires Node 18+.

```
pnpm run deploy              # builds & pushes dist/ → gh-pages branch
```

```text
vite.config.js already sets base: "/<repo-name>/", so paths resolve at
https://<username>.github.io/<repo-name>/.
```

## 🗂 Project Structure
```text
src/
 ├─ assets/                # images & icons
 ├─ components/            # Navbar, Hero, About, …
 ├─ canvas/                # 3-D React-Three components
 ├─ constants/             # timeline / nav data
 ├─ hoc/                   # SectionWrapper
 ├─ utils/                 # motion variants
 └─ App.jsx
```

## 📝 License
MIT — fork, learn, remix!
A link back to this repo or the original tutorial is always appreciated.


