# AI Assistant — Conversational Flows

The assistant handles two categories of spoken/typed input: **attendance actions** and **informational queries**. Route by simple intent classification before deciding which handler to call.

## Intent categories

| Intent | Trigger examples | Handler |
|---|---|---|
| `mark_attendance` | "Prakhar Pankaj Present", "mark me present" | Voice verification flow (see `VOICE_AUTHENTICATION.md`) |
| `check_attendance` | "What is my attendance percentage?", "how many classes have I attended" | Query `attendance` table, calculate % for the logged-in/verified student |
| `search_student` | "Search Prakhar Pankaj", "find roll number 21" | Query `students` table, return name/roll/attendance % only |
| `unknown` | anything not matching the above | Fallback response asking the student to rephrase |

Keep intent detection simple: keyword/pattern matching (e.g. "present" → mark_attendance, "percentage"/"attendance %" → check_attendance, "search"/"find" → search_student) is enough for a mini project — no need for a trained ML classifier here unless you want extra innovation marks and have time.

## Sample dialogues

### Mark attendance
```
Student: "Prakhar Pankaj Present"
AI: "I recognized you as Prakhar Pankaj. Voice verified.
     Do you want to mark attendance?"
Student: "Yes"
AI: "Attendance marked successfully."
```

Failure case:
```
Student: "Prakhar Pankaj Present"
AI: "I couldn't verify your voice with enough confidence.
     Please try again, speaking clearly, or contact your admin."
```

### Check attendance percentage
```
Student: "What is my attendance percentage?"
AI: "Your attendance is 84%."
```

### Search student
```
Student: "Search Prakhar Pankaj"
AI: "Prakhar Pankaj, Roll No. 21, Attendance: 84%."
```

## Response generation
- For simple factual responses (percentage, search results), template strings are enough — you don't need to call an LLM for these, it's faster and more reliable to just format the DB result into a sentence.
- Use the OpenAI API (or a local rule-based responder if you want to avoid API costs/dependency for the demo) only for the more natural-sounding confirmation phrases, or skip it entirely and use templates everywhere — this is a reasonable simplification to note in your report if time is tight.
- Convert the final text response to speech using a TTS engine (browser's built-in `SpeechSynthesis` API is the simplest — no extra backend work needed) so the assistant "talks back."

## Edge cases to handle
- Student not yet enrolled → clear message directing them to enrollment page
- Attendance already marked for today → "You're already marked present today."
- Ambiguous search (multiple name matches) → list options, ask which one
