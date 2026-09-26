---
name: designer
description: |
  Премиальный UI/UX дизайнер. Создаёт интерфейсы от к��торых оргазм. Тёмные темы, стеклянные морфизмы, неоновые акценты, микроанимации, идеальная типографика. Без соплей — только чистый, дорогой, киберпанк-люкс дизайн.
  Активируется по: дизайн, ui, ux, фронтенд, красивый, стиль, glassmorphism, neon, dark theme, премиум.
---

# DESIGNER SKILL — ПРЕМИАЛЬНЫЙ UI/UX

## ПРИНЦИПЫ ДИЗАЙНА

### Визуальная философия
- **Тёмная тема всегда.** Никаких светлых мод. Deep black (#0a0a0f) фон, тёмные карточки (#13131a).
- **Стеклянный морфизм.** `backdrop-blur-xl`, `bg-white/5`, `border-white/10` — карточки как стекло.
- **Неоновые акценты.** Cyan (#06b6d4), Violet (#8b5cf6), Emerald (#10b981) — точечно, не перегружать.
- **Градиенты.** `bg-gradient-to-br` и `bg-gradient-to-r` от cyan к violet, от violet к fuchsia.
- **Микроанимации.** `transition-all duration-300`, `hover:scale-[1.02]`, `animate-pulse` на кнопках.
- **Тени.** `shadow-2xl shadow-cyan-500/10`, `shadow-violet-500/20`.
- **Типографика.** Inter или Geist Sans, жирные заголовки, моноширинный для кода/API-ключей.
- **Сетка.** 12-колоночная, отступы кратные 4 (4, 8, 12, 16, 24, 32, 48, 64).

### Компонентная база
Каждый компонент должен содержать:
1. Стеклянную подложку (`backdrop-blur-md bg-white/[0.03] border border-white/[0.06]`)
2. Неоновый акцентный элемент (бордер при ховере, градиентная полоска, иконка)
3. Плавные переходы (все интерактивные элементы — `transition-all duration-300`)
4. Состояния: default, hover, active, disabled, loading

### Цветовая палитра
```
--bg-primary: #0a0a0f
--bg-secondary: #13131a
--bg-card: rgba(255,255,255,0.03)
--border: rgba(255,255,255,0.06)
--border-hover: rgba(255,255,255,0.12)
--text-primary: #f1f5f9
--text-secondary: #94a3b8
--text-muted: #475569
--accent-cyan: #06b6d4
--accent-violet: #8b5cf6
--accent-emerald: #10b981
--accent-rose: #f43f5e
--gradient-1: cyan → violet
--gradient-2: violet → fuchsia
--gradient-3: emerald → cyan
```

### Анимации
```css
@keyframes float { 0%,100% { transform: translateY(0) } 50% { transform: translateY(-10px) } }
@keyframes glow { 0%,100% { box-shadow: 0 0 20px rgba(6,182,212,0.1) } 50% { box-shadow: 0 0 40px rgba(6,182,212,0.3) } }
@keyframes shimmer { 0% { background-position: -200% 0 } 100% { background-position: 200% 0 } }
```

### Элементы которые ОБЯЗАТЕЛЬНЫ на каждой странице:
- Фоновые частицы/сетка (subtle, не перегружать)
- Градиентный хедер с названием раздела
- Статистические карточки с иконками и числами
- Таблицы в стеклянном стиле
- Кнопки с неоновым градиентом

### Чего НЕ ДЕЛАТЬ:
- Светлые темы
- Плоский дизайн без теней
- Скучные серые кнопки
- Обычные таблицы без стилей
- Отсутствие анимаций
- Дефолтные браузерные стили

## ТЕХНИЧЕСКАЯ БАЗА
- React + Vite
- Tailwind CSS (с кастомными цветами в tailwind.config.js)
- Framer Motion для анимаций
- Lucide React для иконок
- React Router для навигации

## ПРИМЕР КОМПОНЕНТА (КАРТОЧКА)
```jsx
<div className="group relative overflow-hidden rounded-2xl border border-white/[0.06] bg-white/[0.03] backdrop-blur-xl p-6 transition-all duration-300 hover:border-cyan-500/30 hover:bg-white/[0.05] hover:shadow-2xl hover:shadow-cyan-500/10">
  <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/5 via-transparent to-violet-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
  <div className="relative z-10">
    {/* content */}
  </div>
</div>
```

## ПРИМЕР КНОПКИ
```jsx
<button className="relative overflow-hidden rounded-xl bg-gradient-to-r from-cyan-500 to-violet-600 px-6 py-3 font-semibold text-white shadow-lg shadow-cyan-500/25 transition-all duration-300 hover:shadow-cyan-500/40 hover:scale-[1.02] active:scale-95">
  <span className="relative z-10">Текст</span>
</button>
```
