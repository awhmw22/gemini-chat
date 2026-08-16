import json
import os
from collections.abc import AsyncGenerator

import jwt
from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from google import genai
from pydantic import BaseModel, EmailStr
from sqlalchemy.orm import Session

from auth import (
    create_access_token,
    decode_access_token,
    hash_password,
    verify_password,
)
from database import SessionLocal
from models import Conversation, Message, User


# ============================================================
# ENVIRONMENT
# ============================================================

load_dotenv()

GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY")

if not GEMINI_API_KEY:
    raise RuntimeError(
        "GEMINI_API_KEY is not configured in the environment."
    )

GEMINI_MODEL = "gemini-3.6-flash"


# ============================================================
# FASTAPI
# ============================================================

app = FastAPI(
    title="Gemini Chat API",
    version="1.0.0",
)


# ============================================================
# CORS
# ============================================================

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "https://huzaifas-ai-chat.wattoohuzaifa18.workers.dev",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ============================================================
# GEMINI
# ============================================================

client = genai.Client(
    api_key=GEMINI_API_KEY,
)


# ============================================================
# AUTHENTICATION
# ============================================================

security = HTTPBearer()


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
) -> User:

    token = credentials.credentials

    try:
        payload = decode_access_token(token)

    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=401,
            detail="Token has expired",
        )

    except jwt.InvalidTokenError:
        raise HTTPException(
            status_code=401,
            detail="Invalid authentication token",
        )

    user_id = payload.get("sub")

    if not user_id:
        raise HTTPException(
            status_code=401,
            detail="Invalid authentication token",
        )

    try:
        user_id = int(user_id)

    except (TypeError, ValueError):
        raise HTTPException(
            status_code=401,
            detail="Invalid authentication token",
        )

    db = SessionLocal()

    try:
        user = (
            db.query(User)
            .filter(User.id == user_id)
            .first()
        )

        if not user:
            raise HTTPException(
                status_code=401,
                detail="User not found",
            )

        return user

    finally:
        db.close()


# ============================================================
# REQUEST SCHEMAS
# ============================================================

class RegisterRequest(BaseModel):
    email: EmailStr
    password: str


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class ChatRequest(BaseModel):
    message: str
    conversation_id: int | None = None


# ============================================================
# ROOT
# ============================================================

@app.get("/")
async def root():

    return {
        "message": "Gemini Chat API is running!",
        "model": GEMINI_MODEL,
    }


# ============================================================
# REGISTER
# ============================================================

@app.post("/auth/register")
async def register(
    request: RegisterRequest,
):

    if len(request.password) < 8:
        raise HTTPException(
            status_code=400,
            detail="Password must be at least 8 characters",
        )

    db = SessionLocal()

    try:

        existing_user = (
            db.query(User)
            .filter(User.email == request.email)
            .first()
        )

        if existing_user:
            raise HTTPException(
                status_code=409,
                detail="Email already registered",
            )

        user = User(
            email=request.email,
            password_hash=hash_password(
                request.password
            ),
        )

        db.add(user)
        db.commit()
        db.refresh(user)

        return {
            "id": user.id,
            "email": user.email,
        }

    finally:
        db.close()


# ============================================================
# LOGIN
# ============================================================

@app.post("/auth/login")
async def login(
    request: LoginRequest,
):

    db = SessionLocal()

    try:

        user = (
            db.query(User)
            .filter(User.email == request.email)
            .first()
        )

        if not user:
            raise HTTPException(
                status_code=401,
                detail="Invalid email or password",
            )

        password_valid = verify_password(
            request.password,
            user.password_hash,
        )

        if not password_valid:
            raise HTTPException(
                status_code=401,
                detail="Invalid email or password",
            )

        token = create_access_token(
            user.id
        )

        return {
            "access_token": token,
            "token_type": "bearer",
        }

    finally:
        db.close()


# ============================================================
# CURRENT USER
# ============================================================

@app.get("/auth/me")
async def get_me(
    current_user: User = Depends(get_current_user),
):

    return {
        "id": current_user.id,
        "email": current_user.email,
    }


# ============================================================
# GET ALL CONVERSATIONS
# ============================================================

@app.get("/conversations")
async def get_conversations(
    current_user: User = Depends(get_current_user),
):

    db = SessionLocal()

    try:

        conversations = (
            db.query(Conversation)
            .filter(
                Conversation.user_id == current_user.id
            )
            .order_by(
                Conversation.id.desc()
            )
            .all()
        )

        return [
            {
                "id": conversation.id,
                "title": conversation.title,
                "created_at": conversation.created_at,
            }
            for conversation in conversations
        ]

    finally:
        db.close()


# ============================================================
# GET ONE CONVERSATION
# ============================================================

@app.get("/conversations/{conversation_id}")
async def get_conversation(
    conversation_id: int,
    current_user: User = Depends(get_current_user),
):

    db = SessionLocal()

    try:

        conversation = (
            db.query(Conversation)
            .filter(
                Conversation.id == conversation_id,
                Conversation.user_id == current_user.id,
            )
            .first()
        )

        if not conversation:
            raise HTTPException(
                status_code=404,
                detail="Conversation not found",
            )

        return {
            "id": conversation.id,
            "title": conversation.title,
            "created_at": conversation.created_at,
            "messages": [
                {
                    "id": message.id,
                    "role": message.role,
                    "content": message.content,
                    "model": message.model,
                    "created_at": message.created_at,
                }
                for message in conversation.messages
            ],
        }

    finally:
        db.close()


# ============================================================
# BUILD PROMPT
# ============================================================

def build_prompt(
    messages: list[Message],
) -> str:

    parts: list[str] = []

    for message in messages:

        if message.role == "user":
            role = "User"

        elif message.role == "assistant":
            role = "Gemini"

        else:
            role = message.role

        parts.append(
            f"{role}: {message.content}"
        )

    return "\n\n".join(parts)


# ============================================================
# NORMAL CHAT
# ============================================================

@app.post("/chat")
async def chat(
    request: ChatRequest,
    current_user: User = Depends(get_current_user),
):

    if not request.message.strip():
        raise HTTPException(
            status_code=400,
            detail="Message cannot be empty",
        )

    db = SessionLocal()

    try:

        if request.conversation_id is not None:

            conversation = (
                db.query(Conversation)
                .filter(
                    Conversation.id == request.conversation_id,
                    Conversation.user_id == current_user.id,
                )
                .first()
            )

            if not conversation:
                raise HTTPException(
                    status_code=404,
                    detail="Conversation not found",
                )

        else:

            conversation = Conversation(
                user_id=current_user.id,
                title=request.message.strip()[:50],
            )

            db.add(conversation)
            db.flush()

        user_message = Message(
            conversation_id=conversation.id,
            role="user",
            content=request.message.strip(),
        )

        db.add(user_message)
        db.flush()

        messages = (
            db.query(Message)
            .filter(
                Message.conversation_id == conversation.id
            )
            .order_by(Message.id)
            .all()
        )

        prompt = build_prompt(messages)

        print("=" * 70)
        print("NORMAL CHAT")
        print("Conversation:", conversation.id)
        print("Prompt:")
        print(prompt)
        print("=" * 70)

        interaction = client.interactions.create(
            model=GEMINI_MODEL,
            input=prompt,
        )

        assistant_text = (
            getattr(
                interaction,
                "output_text",
                None,
            )
            or ""
        ).strip()

        if not assistant_text:
            raise RuntimeError(
                "Gemini returned an empty response."
            )

        assistant_message = Message(
            conversation_id=conversation.id,
            role="assistant",
            content=assistant_text,
            model=GEMINI_MODEL,
        )

        db.add(assistant_message)

        db.commit()

        return {
            "conversation_id": conversation.id,
            "response": assistant_text,
        }

    except HTTPException:
        db.rollback()
        raise

    except Exception as exc:

        db.rollback()

        print(
            "NORMAL CHAT ERROR:",
            repr(exc),
        )

        raise HTTPException(
            status_code=500,
            detail=str(exc),
        )

    finally:
        db.close()


# ============================================================
# STREAMING CHAT
# ============================================================

@app.post("/chat/stream")
async def chat_stream(
    request: ChatRequest,
    current_user: User = Depends(get_current_user),
):

    if not request.message.strip():
        raise HTTPException(
            status_code=400,
            detail="Message cannot be empty",
        )

    db = SessionLocal()

    conversation_id: int | None = None
    user_message_id: int | None = None

    is_new_conversation = False

    prompt = ""

    # ========================================================
    # PREPARE TRANSACTION
    # ========================================================

    try:

        if request.conversation_id is not None:

            conversation = (
                db.query(Conversation)
                .filter(
                    Conversation.id == request.conversation_id,
                    Conversation.user_id == current_user.id,
                )
                .first()
            )

            if not conversation:

                db.rollback()
                db.close()

                raise HTTPException(
                    status_code=404,
                    detail="Conversation not found",
                )

        else:

            conversation = Conversation(
                user_id=current_user.id,
                title=request.message.strip()[:50],
            )

            db.add(conversation)
            db.flush()

            is_new_conversation = True

        conversation_id = conversation.id

        user_message = Message(
            conversation_id=conversation_id,
            role="user",
            content=request.message.strip(),
        )

        db.add(user_message)
        db.flush()

        user_message_id = user_message.id

        messages = (
            db.query(Message)
            .filter(
                Message.conversation_id == conversation_id
            )
            .order_by(Message.id)
            .all()
        )

        prompt = build_prompt(messages)

        print()
        print("=" * 70)
        print("PREPARING GEMINI STREAM")
        print("Conversation:", conversation_id)
        print("User message:", user_message_id)
        print("New conversation:", is_new_conversation)
        print("Prompt:", prompt)
        print("=" * 70)

    except HTTPException:
        db.rollback()
        db.close()
        raise

    except Exception as exc:

        db.rollback()
        db.close()

        print()
        print("=" * 70)
        print("FAILED TO PREPARE CHAT")
        print("Error:", repr(exc))
        print("=" * 70)

        raise HTTPException(
            status_code=500,
            detail="Failed to prepare chat request.",
        )

    # ========================================================
    # GENERATOR
    # ========================================================

    async def generate() -> AsyncGenerator[str, None]:

        full_response: list[str] = []

        gemini_succeeded = False

        try:

            print()
            print("=" * 70)
            print("STARTING GEMINI STREAM")
            print("Conversation:", conversation_id)
            print("User message:", user_message_id)
            print("Prompt:", prompt)
            print("=" * 70)

            stream = client.interactions.create(
                model=GEMINI_MODEL,
                input=prompt,
                stream=True,
            )

            yield (
                json.dumps(
                    {
                        "type": "conversation",
                        "conversation_id": conversation_id,
                    }
                )
                + "\n"
            )

            for event in stream:

                event_type = getattr(
                    event,
                    "event_type",
                    None,
                )

                print(
                    "Gemini event type:",
                    event_type,
                )

                # =================================================
                # GEMINI ERROR
                # =================================================

                if event_type == "error":

                    error = getattr(
                        event,
                        "error",
                        None,
                    )

                    error_message = getattr(
                        error,
                        "message",
                        None,
                    )

                    error_code = getattr(
                        error,
                        "code",
                        None,
                    )

                    if not error_message:
                        error_message = getattr(
                            event,
                            "message",
                            None,
                        )

                    if not error_code:
                        error_code = getattr(
                            event,
                            "code",
                            None,
                        )

                    print()
                    print("=" * 70)
                    print("GEMINI API ERROR")
                    print("Error code:", error_code)
                    print("Error message:", error_message)
                    print("Error object:", repr(error))
                    print("Full event:", repr(event))
                    print("=" * 70)

                    message = (
                        error_message
                        or "Gemini returned an unknown error."
                    )

                    message_lower = str(
                        message
                    ).lower()

                    code_lower = str(
                        error_code or ""
                    ).lower()

                    if (
                        code_lower
                        in {
                            "quota_exceeded",
                            "resource_exhausted",
                        }
                        or "quota" in message_lower
                        or "resource exhausted" in message_lower
                    ):

                        raise RuntimeError(
                            "Gemini API quota exceeded. "
                            "Please wait a minute and try again."
                        )

                    if (
                        "rate limit" in message_lower
                        or "rate_limit" in message_lower
                        or "too many requests" in message_lower
                    ):

                        raise RuntimeError(
                            "Gemini is temporarily rate-limited. "
                            "Please wait a moment and try again."
                        )

                    if error_code:

                        raise RuntimeError(
                            f"Gemini API error "
                            f"({error_code}): {message}"
                        )

                    raise RuntimeError(
                        f"Gemini API error: {message}"
                    )

                # =================================================
                # TEXT DELTA
                # =================================================

                if event_type == "step.delta":

                    delta = getattr(
                        event,
                        "delta",
                        None,
                    )

                    if not delta:
                        continue

                    delta_type = getattr(
                        delta,
                        "type",
                        None,
                    )

                    print(
                        "Delta type:",
                        delta_type,
                    )

                    if delta_type == "text":

                        text = getattr(
                            delta,
                            "text",
                            None,
                        )

                        if text:

                            print(
                                "TEXT CHUNK:",
                                repr(text),
                            )

                            full_response.append(text)

                            yield (
                                json.dumps(
                                    {
                                        "type": "chunk",
                                        "content": text,
                                    }
                                )
                                + "\n"
                            )

                # =================================================
                # COMPLETED
                # =================================================

                elif event_type == "interaction.completed":

                    print(
                        "Gemini interaction completed."
                    )

            # ====================================================
            # FINAL RESPONSE
            # ====================================================

            assistant_text = "".join(
                full_response
            ).strip()

            print()
            print("=" * 70)
            print(
                "FINAL GEMINI RESPONSE:",
                repr(assistant_text),
            )
            print("=" * 70)

            if not assistant_text:

                raise RuntimeError(
                    "Gemini returned an empty response."
                )

            gemini_succeeded = True

            # ====================================================
            # CREATE ASSISTANT MESSAGE
            # ====================================================

            assistant_message = Message(
                conversation_id=conversation_id,
                role="assistant",
                content=assistant_text,
                model=GEMINI_MODEL,
            )

            db.add(assistant_message)

            # ====================================================
            # COMMIT EVERYTHING
            # ====================================================

            db.commit()

            print()
            print("=" * 70)
            print("CHAT SAVED SUCCESSFULLY")
            print("Conversation:", conversation_id)
            print("User message:", user_message_id)
            print("Assistant message:", assistant_message.id)
            print("=" * 70)

            yield (
                json.dumps(
                    {
                        "type": "done",
                        "conversation_id": conversation_id,
                    }
                )
                + "\n"
            )

        # ========================================================
        # ERROR
        # ========================================================

        except Exception as exc:

            print()
            print("=" * 70)
            print(
                "GEMINI STREAMING ERROR:",
                repr(exc),
            )
            print("=" * 70)

            if not gemini_succeeded:

                try:

                    db.rollback()

                    print(
                        "Rolled back failed Gemini request."
                    )

                    print(
                        "User message was NOT saved."
                    )

                    if is_new_conversation:

                        print(
                            "New conversation was NOT saved."
                        )

                except Exception as rollback_error:

                    print(
                        "ROLLBACK ERROR:",
                        repr(rollback_error),
                    )

            error_message = str(exc)

            error_lower = error_message.lower()

            if (
                "quota" in error_lower
                or "rate limit" in error_lower
                or "rate_limit" in error_lower
                or "resource exhausted" in error_lower
            ):

                error_message = (
                    "⚠️ Gemini API quota exceeded. "
                    "Please wait a minute and try again."
                )

            yield (
                json.dumps(
                    {
                        "type": "error",
                        "message": error_message,
                    }
                )
                + "\n"
            )

        finally:

            db.close()

            print(
                "Database connection closed."
            )

    # ========================================================
    # RETURN STREAM
    # ========================================================

    return StreamingResponse(
        generate(),
        media_type="application/x-ndjson",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


# ============================================================
# DELETE CONVERSATION
# ============================================================

@app.delete("/conversations/{conversation_id}")
async def delete_conversation(
    conversation_id: int,
    current_user: User = Depends(get_current_user),
):

    db = SessionLocal()

    try:

        conversation = (
            db.query(Conversation)
            .filter(
                Conversation.id == conversation_id,
                Conversation.user_id == current_user.id,
            )
            .first()
        )

        if not conversation:
            raise HTTPException(
                status_code=404,
                detail="Conversation not found",
            )

        # ----------------------------------------------------
        # Delete messages
        # ----------------------------------------------------

        db.query(Message).filter(
            Message.conversation_id == conversation_id
        ).delete(
            synchronize_session=False
        )

        # ----------------------------------------------------
        # Delete conversation
        # ----------------------------------------------------

        db.delete(conversation)

        db.commit()

        return {
            "message": "Conversation deleted permanently",
            "conversation_id": conversation_id,
        }

    except HTTPException:
        db.rollback()
        raise

    except Exception as exc:

        db.rollback()

        print(
            "DELETE CONVERSATION ERROR:",
            repr(exc),
        )

        raise HTTPException(
            status_code=500,
            detail="Failed to delete conversation",
        )

    finally:
        db.close()