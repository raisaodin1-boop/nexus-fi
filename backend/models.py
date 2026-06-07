"""Pydantic models for HODIX. All IDs are UUID strings (not ObjectId)."""
from datetime import datetime, timezone
from enum import Enum
from typing import Optional, List
import uuid

from pydantic import BaseModel, EmailStr, Field


def gen_id() -> str:
    return str(uuid.uuid4())


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


class Role(str, Enum):
    MEMBER = "member"
    TONTINE_MANAGER = "tontine_manager"
    SUPER_ADMIN = "super_admin"


# ============= AUTH =============
class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6)
    full_name: str = Field(min_length=2)
    role: Optional[str] = "member"
    # Consentements obligatoires — doivent tous être True
    consent_cgu: bool = False
    consent_data: bool = False
    consent_fees: bool = False
    consent_date: Optional[str] = None
    referral_code: Optional[str] = None


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str = Field(min_length=6)


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int
    user: "UserPublic"


# ============= USER =============
class UserPublic(BaseModel):
    id: str
    email: EmailStr
    full_name: str
    role: Role
    is_email_verified: bool = False
    phone: Optional[str] = None
    gender: Optional[str] = None
    country: Optional[str] = None
    city: Optional[str] = None
    occupation: Optional[str] = None
    photo_base64: Optional[str] = None
    created_at: datetime


class ProfileUpdate(BaseModel):
    full_name: Optional[str] = None
    phone: Optional[str] = None
    gender: Optional[str] = None
    country: Optional[str] = None
    city: Optional[str] = None
    occupation: Optional[str] = None
    photo_base64: Optional[str] = None


# ============= SAVINGS =============
class SavingsType(str, Enum):
    FLEXIBLE = "flexible"
    LOCKED = "locked"
    RECURRING = "recurring"


class SavingsGoalCreate(BaseModel):
    name: str
    target_amount: float = Field(gt=0)
    deadline: Optional[datetime] = None
    savings_type: SavingsType = SavingsType.FLEXIBLE
    currency: str = "XAF"
    note: Optional[str] = None


class SavingsGoal(BaseModel):
    id: str
    user_id: str
    name: str
    target_amount: float
    current_amount: float = 0.0
    deadline: Optional[datetime] = None
    savings_type: SavingsType
    currency: str
    note: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class SavingsTransactionCreate(BaseModel):
    amount: float = Field(gt=0)
    kind: str = "deposit"  # deposit or withdraw
    note: Optional[str] = None


class SavingsTransaction(BaseModel):
    id: str
    goal_id: str
    user_id: str
    amount: float
    kind: str
    note: Optional[str] = None
    created_at: datetime


# ============= TONTINES =============
class Frequency(str, Enum):
    DAILY = "daily"
    WEEKLY = "weekly"
    BIWEEKLY = "biweekly"
    MONTHLY = "monthly"


class TontineCreate(BaseModel):
    name: str
    description: Optional[str] = None
    contribution_amount: float = Field(gt=0)
    frequency: Frequency = Frequency.MONTHLY
    max_members: int = Field(ge=2, le=200, default=10)
    currency: str = "XAF"
    rotation_mode: Optional[str] = "rotation"  # rotation | random | custom
    is_public: bool = False


class TontineMember(BaseModel):
    id: str
    tontine_id: str
    user_id: str
    full_name: str
    role: str = "member"  # member, admin
    rotation_position: Optional[int] = None
    has_received: bool = False
    received_at: Optional[datetime] = None
    joined_at: datetime


class Tontine(BaseModel):
    id: str
    name: str
    description: Optional[str]
    admin_id: str
    contribution_amount: float
    frequency: Frequency
    max_members: int
    currency: str
    invite_code: str
    current_cycle: int = 1
    members_count: int = 0
    total_collected: float = 0.0
    is_active: bool = True
    created_at: datetime


class TontineContributionCreate(BaseModel):
    member_user_id: str
    amount: float = Field(gt=0)
    note: Optional[str] = None


# ============= ASSOCIATIONS / COOPERATIVES =============
class GroupCreate(BaseModel):
    name: str
    description: Optional[str] = None
    membership_fee: float = Field(ge=0, default=0)
    currency: str = "XAF"


class GroupContribution(BaseModel):
    member_user_id: str
    amount: float = Field(gt=0)
    purpose: Optional[str] = "membership"
    note: Optional[str] = None


# ============= COMMUNITY FUNDS =============
class CommunityFundCreate(BaseModel):
    name: str
    description: Optional[str] = None
    target_amount: Optional[float] = None
    currency: str = "XAF"


class FundTransactionCreate(BaseModel):
    amount: float = Field(gt=0)
    kind: str = "contribution"  # contribution or withdrawal
    note: Optional[str] = None


# ============= NOTIFICATIONS =============
class Notification(BaseModel):
    id: str
    user_id: str
    title: str
    body: str
    kind: str = "info"  # info, success, warning, alert
    is_read: bool = False
    action_url: Optional[str] = None
    created_at: datetime


TokenResponse.model_rebuild()
