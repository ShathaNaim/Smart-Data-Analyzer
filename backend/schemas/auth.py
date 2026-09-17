import uuid

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator


class Credentials(BaseModel):
    email: EmailStr

    @field_validator("email", mode="after")
    @classmethod
    def normalize_email(cls, value: str) -> str:
        return value.lower()


class SignupRequest(Credentials):
    password: str = Field(min_length=15, max_length=128)


class SigninRequest(Credentials):
    password: str = Field(min_length=1, max_length=128)


class UserResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    email: EmailStr


class AuthResponse(BaseModel):
    user: UserResponse


class MessageResponse(BaseModel):
    message: str

class GuestWorkspaceTransferRequest(BaseModel):
    expected_account_id: uuid.UUID
