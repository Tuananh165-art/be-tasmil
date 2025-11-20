import { Body, Controller, Param, ParseEnumPipe, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { SocialAuthService } from './social-auth.service';
import { UpsertSocialTokenDto } from './dto/upsert-social-token.dto';
import { SocialProvider } from '../../common/enums/social-provider.enum';

@ApiTags('Social Auth')
@ApiBearerAuth()
@Controller('social-auth')
export class SocialAuthController {
  constructor(private readonly socialAuthService: SocialAuthService) {}

  @Post(':provider/token')
  async upsertToken(
    @Param('provider', new ParseEnumPipe(SocialProvider))
    provider: SocialProvider,
    @Body() dto: UpsertSocialTokenDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.socialAuthService.upsertAccount(user.sub, provider, dto);
  }
}
