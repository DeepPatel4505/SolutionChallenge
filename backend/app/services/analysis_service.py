import httpx
from app.config import GROQ_API_KEY

GROQ_URL = "https://api.groq.com/openai/v1/chat/completions"
GROQ_MODEL = "llama-3.1-8b-instant"


async def _call_groq(system_prompt: str, user_prompt: str, max_tokens: int = 4096) -> str:
    """Generic Groq API call."""
    if not GROQ_API_KEY:
        raise RuntimeError("GROQ_API_KEY is not set")

    async with httpx.AsyncClient(timeout=120.0) as client:
        response = await client.post(
            GROQ_URL,
            headers={
                "Authorization": f"Bearer {GROQ_API_KEY}",
                "Content-Type": "application/json",
            },
            json={
                "model": GROQ_MODEL,
                "messages": [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt},
                ],
                "temperature": 0.3,
                "max_tokens": max_tokens,
            },
        )
        if response.status_code != 200:
            raise RuntimeError(f"Groq API error: {response.status_code} - {response.text}")
        return response.json()["choices"][0]["message"]["content"]


# ──────────────────────────────────────
# 1. MULTIPLE SUMMARY FORMATS
# ──────────────────────────────────────

async def generate_summary(transcript: str, format_type: str = "detailed") -> str:
    """Generate summary in different formats."""
    prompts = {
        "short": "Write a concise 3-5 sentence summary of this lecture. Be brief but cover all major points.",

        "bullet": """Create a bullet-point summary of this lecture:
- Use clear, concise bullet points
- Group related points together
- Include all key information
- Use sub-bullets for details""",

        "detailed": """Create a comprehensive structured summary:
## 📋 Overview
(2-3 sentence overview)
## 🎯 Key Topics
(list all major topics)
## 📝 Detailed Summary
(organized by topic with key points)
## 💡 Key Takeaways
(numbered list of important takeaways)
## 📚 Important Terms
(term: definition format)""",

        "exam": """Create an exam-focused summary optimized for revision:
## 🎯 Most Likely Exam Topics
(rank by importance)
## 📝 Key Concepts to Remember
(concept + brief explanation)
## ⚠️ Common Mistakes to Avoid
(things students often get wrong)
## 📊 Formulas/Rules/Laws
(if applicable)
## 💡 Quick Revision Points
(one-line points for last-minute revision)""",

        "concept": """Create a concept-level summary organized as a concept map:
## Core Concept
(main topic of the lecture)
## Related Concepts
### Concept 1
- Definition
- How it relates to core concept
- Key properties
### Concept 2
(same format)
## Concept Relationships
(how concepts connect to each other)
## Prerequisites
(what you need to know before this)""",
    }

    fmt = prompts.get(format_type, prompts["detailed"])
    system = "You are an expert academic assistant creating lecture summaries. Use markdown formatting."
    user = f"{fmt}\n\n---\nTRANSCRIPT:\n{transcript}"
    return await _call_groq(system, user)


# ──────────────────────────────────────
# 2. AUTO NOTES GENERATOR
# ──────────────────────────────────────

async def generate_notes(transcript: str) -> str:
    """Transform transcript into clean structured notes."""
    system = "You are an expert note-taker creating clean, organized lecture notes from a transcript."
    user = f"""Transform this lecture transcript into clean, well-organized notes:

Requirements:
1. Fix all grammar and make sentences clean
2. Create clear headings and subheadings (use ## and ###)
3. **Bold** key points and important statements
4. Extract and highlight definitions using > blockquotes
5. Use bullet points for lists
6. Mark important statements with ⚠️
7. Add section dividers between topics
8. Make it easy to scan and study from

TRANSCRIPT:
{transcript}"""
    return await _call_groq(system, user)


# ──────────────────────────────────────
# 3. KEYWORD & CONCEPT EXTRACTION
# ──────────────────────────────────────

async def extract_keywords(transcript: str) -> str:
    """Extract keywords, technical terms, glossary, and topic clusters."""
    system = "You are an expert at analyzing academic content and extracting key information."
    user = f"""Analyze this lecture transcript and extract:

## 🔑 Important Keywords
(list top 15-20 keywords with brief context)

## 🔬 Technical Terms
(list all technical/specialized terms with definitions)

## 📖 Glossary
(alphabetically ordered term: definition pairs)

## 🗂️ Topic Clusters
(group related concepts into clusters with labels)

TRANSCRIPT:
{transcript}"""
    return await _call_groq(system, user)


# ──────────────────────────────────────
# 4. Q&A GENERATOR
# ──────────────────────────────────────

async def generate_questions(transcript: str, qtype: str = "mixed") -> str:
    """Generate questions from lecture content."""
    prompts = {
        "mcq": """Generate 10 Multiple Choice Questions from this lecture.
Format each as:
### Q1. [Question]
- A) [Option]
- B) [Option]
- C) [Option]
- D) [Option]
**Answer: [Letter]) [Explanation]**""",

        "short": """Generate 10 Short Answer Questions from this lecture.
Format each as:
### Q1. [Question]
**Answer:** [2-3 sentence answer]""",

        "long": """Generate 5 Long Answer Questions from this lecture.
Format each as:
### Q1. [Question]
**Model Answer:** [Detailed 1-2 paragraph answer]""",

        "flashcards": """Generate 15 Flashcards from this lecture.
Format each as:
### Card 1
**Front:** [Question/Term]
**Back:** [Answer/Definition]
---""",

        "mixed": """Generate a practice test from this lecture content:

## Section A: Multiple Choice (5 questions)
(format: question + 4 options + answer)

## Section B: Short Answer (5 questions)
(format: question + brief answer)

## Section C: Long Answer (2 questions)
(format: question + detailed answer)

## Flashcards (5 cards)
(format: front/back pairs)""",
    }

    fmt = prompts.get(qtype, prompts["mixed"])
    system = "You are an expert exam paper setter creating questions from lecture content. Questions should test understanding, not just memory."
    user = f"{fmt}\n\nTRANSCRIPT:\n{transcript}"
    return await _call_groq(system, user)


# ──────────────────────────────────────
# 5. TOPIC SEGMENTATION
# ──────────────────────────────────────

async def segment_topics(transcript: str) -> str:
    """Automatically segment lecture into topics/chapters."""
    system = "You are an expert at organizing academic content into logical sections."
    user = f"""Analyze this lecture transcript and split it into logical topics/chapters:

For each topic provide:
## Chapter [N]: [Topic Title]
**Duration estimate:** [approximate portion of lecture]
**Key Points:**
- Point 1
- Point 2
**Summary:** [1-2 sentence summary of this section]

---

Make sure topics flow logically and cover the entire lecture.

TRANSCRIPT:
{transcript}"""
    return await _call_groq(system, user)


# ──────────────────────────────────────
# 6. SMART HIGHLIGHT DETECTION
# ──────────────────────────────────────

async def detect_highlights(transcript: str) -> str:
    """Detect important statements and highlights in the transcript."""
    system = "You are an expert at identifying critical moments and important statements in lectures."
    user = f"""Analyze this lecture transcript and find:

## ⚠️ Explicitly Marked Important
Statements where the speaker says "important", "remember this", "note this", "key point", "this will come in exam", etc.

## 🔴 Critical Concepts
The most critical concepts that students MUST understand.

## 📌 Definitions Given
Any definitions explicitly stated by the speaker.

## 💡 Examples & Analogies
Notable examples or analogies used to explain concepts.

## ❓ Questions Asked
Any questions posed by the speaker or students.

For each item, quote the relevant text and explain why it's important.

TRANSCRIPT:
{transcript}"""
    return await _call_groq(system, user)


# ──────────────────────────────────────
# 7. TRANSLATION
# ──────────────────────────────────────

LANGUAGE_MAP = {
    "hindi": "Hindi (हिन्दी)",
    "hinglish": "Hinglish (Hindi written in English/Roman script, mixing Hindi and English naturally)",
    "gujarati": "Gujarati (ગુજરાતી)",
    "marathi": "Marathi (मराठी)",
    "tamil": "Tamil (தமிழ்)",
    "telugu": "Telugu (తెలుగు)",
    "bengali": "Bengali (বাংলা)",
    "kannada": "Kannada (ಕನ್ನಡ)",
}


async def translate_content(content: str, target_language: str) -> str:
    """Translate content to the specified language."""
    lang_name = LANGUAGE_MAP.get(target_language, target_language)

    system = f"""You are an expert translator. Translate the following content to {lang_name}.
Rules:
- Keep all markdown formatting (##, ###, **, -, etc.) intact
- Keep emojis and special symbols as they are
- For technical terms, keep the English term in parentheses after the translation
- If the target is Hinglish, write Hindi words using English/Roman letters (e.g., "yeh bahut important hai")
- Maintain the same structure and organization
- Do NOT add any extra content or explanations"""

    user = f"Translate the following to {lang_name}:\n\n{content}"
    return await _call_groq(system, user, max_tokens=4096)

